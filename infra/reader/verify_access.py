"""Read-only AWS policy validation and negative permission simulations."""
import argparse
import json
from pathlib import Path

def verify(directory, account, subnet):
    import boto3
    iam = boto3.client('iam')
    analyzer = boto3.client('accessanalyzer', region_name='ap-northeast-2')
    policies = {name: json.loads((directory / (name + '-policy.json')).read_text())
                for name in ['deployer', 'node', 'operator-assume']}
    for name, policy in policies.items():
        findings = analyzer.validate_policy(policyDocument=json.dumps(policy),
                                            policyType='IDENTITY_POLICY')['findings']
        errors = [f for f in findings if f['findingType'] in ['ERROR', 'SECURITY_WARNING']]
        print(name, 'validation:', [(f['findingType'], f['issueCode']) for f in findings])
        assert not errors, errors
    root = f'arn:aws:ec2:ap-northeast-2:{account}:'
    role = f'arn:aws:iam::{account}:role/'
    profile = f'arn:aws:iam::{account}:instance-profile/dechive-wiki-p0-reader-node'
    instance = root + 'instance/i-0123456789abcdef0'
    stack = f'arn:aws:cloudformation:ap-northeast-2:{account}:stack/dechive-wiki-p0-reader/example'
    passed = 0

    def check(name, policy, action, resource, expected, context=None):
        nonlocal passed
        entries = []
        for key, value in (context or {}).items():
            kind = 'boolean' if isinstance(value, bool) else 'numeric' if isinstance(value, int) else 'stringList' if isinstance(value, list) else 'string'
            values = value if isinstance(value, list) else [str(value).lower() if isinstance(value, bool) else str(value)]
            entries.append({'ContextKeyName': key, 'ContextKeyValues': values, 'ContextKeyType': kind})
        result = iam.simulate_custom_policy(PolicyInputList=[json.dumps(policies[policy])],
            ActionNames=[action], ResourceArns=[resource], ContextEntries=entries)['EvaluationResults'][0]
        allowed = result['EvalDecision'] == 'allowed'
        assert allowed == expected, (name, result)
        passed += 1
        print('PASS', name)

    launch = {'aws:RequestTag/Project': 'DECHIVE-WIKI', 'aws:RequestTag/Environment': 'p0',
              'aws:RequestTag/Name': 'dechive-wiki-p0-reader', 'ec2:InstanceType': 't3.small',
              'ec2:InstanceProfile': profile, 'ec2:MetadataHttpTokens': 'required'}
    check('intended small instance', 'deployer', 'ec2:RunInstances', instance, True, launch)
    for title, key, value in [('large instance', 'ec2:InstanceType', 'm7i.8xlarge'),
                              ('wrong project', 'aws:RequestTag/Project', 'OTHER'),
                              ('wrong profile', 'ec2:InstanceProfile', role + 'Administrator'),
                              ('optional IMDS tokens', 'ec2:MetadataHttpTokens', 'optional')]:
        check('deny ' + title, 'deployer', 'ec2:RunInstances', instance, False, {**launch, key: value})
    volume = {'aws:RequestTag/Project': 'DECHIVE-WIKI', 'aws:RequestTag/Environment': 'p0',
              'ec2:Encrypted': True, 'ec2:VolumeSize': 30}
    check('encrypted 30 GiB volume', 'deployer', 'ec2:RunInstances', root + 'volume/vol-0123456789abcdef0', True, volume)
    for title, key, value in [('unencrypted disk', 'ec2:Encrypted', False), ('oversize disk', 'ec2:VolumeSize', 100)]:
        check('deny ' + title, 'deployer', 'ec2:RunInstances', root + 'volume/vol-0123456789abcdef0', False, {**volume, key: value})
    tags = {'ec2:ResourceTag/Project': 'DECHIVE-WIKI', 'ec2:ResourceTag/Environment': 'p0',
            'ec2:ResourceTag/Name': 'dechive-wiki-p0-reader'}
    check('stop own reader', 'deployer', 'ec2:StopInstances', instance, True, tags)
    check('deny untagged instance stop', 'deployer', 'ec2:StopInstances', instance, False)
    check('own stack read', 'deployer', 'cloudformation:DescribeStacks', stack, True)
    check('deny other stack read', 'deployer', 'cloudformation:DescribeStacks', stack.replace('p0-reader', 'other'), False)
    types = {'cloudformation:ResourceTypes': ['AWS::EC2::Instance', 'AWS::EC2::SecurityGroup']}
    check('only two host resource types', 'deployer', 'cloudformation:CreateChangeSet', stack, True, types)
    check('deny missing type boundary', 'deployer', 'cloudformation:CreateChangeSet', stack, False)
    check('deny IAM in host stack', 'deployer', 'cloudformation:CreateChangeSet', stack, False,
          {'cloudformation:ResourceTypes': ['AWS::EC2::Instance', 'AWS::IAM::Role']})
    check('pass reader role to EC2', 'deployer', 'iam:PassRole', role + 'dechive-wiki-p0-reader-node', True,
          {'iam:PassedToService': 'ec2.amazonaws.com'})
    check('deny passing admin role', 'deployer', 'iam:PassRole', role + 'Administrator', False,
          {'iam:PassedToService': 'ec2.amazonaws.com'})
    check('deny creating IAM user', 'deployer', 'iam:CreateUser', f'arn:aws:iam::{account}:user/example', False)
    check('deny secret access', 'deployer', 'secretsmanager:GetSecretValue', f'arn:aws:secretsmanager:ap-northeast-2:{account}:secret:example', False)
    check('deny node parameter access', 'node', 'ssm:GetParameter', f'arn:aws:ssm:ap-northeast-2:{account}:parameter/private', False)
    check('node control channel', 'node', 'ssmmessages:CreateControlChannel', '*', True,
          {'aws:RequestedRegion': 'ap-northeast-2'})
    check('deny operator without MFA', 'operator-assume', 'sts:AssumeRole', role + 'dechive-wiki-p0-deployer', False)
    check('operator MFA role entry', 'operator-assume', 'sts:AssumeRole', role + 'dechive-wiki-p0-deployer', True,
          {'aws:MultiFactorAuthPresent': True})
    check('deny other role entry', 'operator-assume', 'sts:AssumeRole', role + 'Administrator', False,
          {'aws:MultiFactorAuthPresent': True})
    check('deny out-of-region describe', 'deployer', 'ec2:DescribeInstances', '*', False,
          {'aws:RequestedRegion': 'us-east-1'})
    check('interface in pinned subnet', 'deployer', 'ec2:RunInstances', root + 'network-interface/eni-0123456789abcdef0', True,
          {'ec2:Subnet': root + 'subnet/' + subnet})
    check('deny another subnet', 'deployer', 'ec2:RunInstances', root + 'network-interface/eni-0123456789abcdef0', False,
          {'ec2:Subnet': root + 'subnet/subnet-00000000000000000'})
    check('MFA operator Seoul shell', 'operator-assume', 'cloudshell:CreateEnvironment', '*', True,
          {'aws:MultiFactorAuthPresent': True, 'aws:RequestedRegion': 'ap-northeast-2'})
    check('deny shell without MFA', 'operator-assume', 'cloudshell:CreateEnvironment', '*', False,
          {'aws:RequestedRegion': 'ap-northeast-2'})
    check('deny out-of-region shell', 'operator-assume', 'cloudshell:CreateEnvironment', '*', False,
          {'aws:MultiFactorAuthPresent': True, 'aws:RequestedRegion': 'us-east-1'})
    print('AWS_ACCESS_SIMULATION_' + str(passed) + '_CHECKS_SUCCESS')

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--account', required=True)
    p.add_argument('--subnet', required=True)
    args = p.parse_args()
    verify(args.directory, args.account, args.subnet)
