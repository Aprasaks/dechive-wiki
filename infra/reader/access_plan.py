"""Generate a reviewable IAM bootstrap and IAM-free host template. Never applies it."""
import argparse
import json
import re
from pathlib import Path

REGION = 'ap-northeast-2'
PROJECT = 'DECHIVE-WIKI'
STACK = 'dechive-wiki-p0-reader'
DEPLOYER = 'dechive-wiki-p0-deployer'
NODE = 'dechive-wiki-p0-reader-node'
OPERATOR = 'dechive-wiki-operator'

def documents(account, vpc, subnet, ami):
    assert re.fullmatch(r'\d{12}', account)
    for value, prefix in [(vpc, 'vpc'), (subnet, 'subnet'), (ami, 'ami')]:
        assert re.fullmatch(prefix + r'-[0-9a-f]{8,17}', value)
    ec2 = f'arn:aws:ec2:{REGION}:'
    own = ec2 + account + ':'
    iam = f'arn:aws:iam::{account}:'
    stack = f'arn:aws:cloudformation:{REGION}:{account}:stack/{STACK}/*'
    node_role = iam + 'role/' + NODE
    profile = iam + 'instance-profile/' + NODE
    request_tags = {'aws:RequestTag/Project': PROJECT,
                    'aws:RequestTag/Environment': 'p0'}
    resource_tags = {'ec2:ResourceTag/Project': PROJECT,
                     'ec2:ResourceTag/Environment': 'p0'}
    statements = []

    def allow(sid, actions, resources, condition=None):
        row = {'Sid': sid, 'Effect': 'Allow', 'Action': actions, 'Resource': resources}
        if condition:
            row['Condition'] = condition
        statements.append(row)

    allow('ReadSeoulInfrastructure', [
        'ec2:DescribeInstances', 'ec2:DescribeInstanceStatus', 'ec2:DescribeImages',
        'ec2:DescribeSubnets', 'ec2:DescribeVpcs', 'ec2:DescribeRouteTables',
        'ec2:DescribeSecurityGroups', 'ec2:DescribeVolumes', 'ec2:DescribeNetworkInterfaces',
    ], '*', {'StringEquals': {'aws:RequestedRegion': REGION}})
    allow('LaunchOnlyPinnedImageAndSubnet', 'ec2:RunInstances', [
        ec2 + ':image/' + ami, own + 'subnet/' + subnet,
    ])
    allow('LaunchOnlySmallTaggedReader', 'ec2:RunInstances', own + 'instance/*', {
        'StringEquals': dict(request_tags, **{
            'aws:RequestTag/Name': STACK, 'ec2:InstanceType': 't3.small',
            'ec2:InstanceProfile': profile, 'ec2:MetadataHttpTokens': 'required',
        }),
    })
    allow('LaunchEncryptedSmallVolumes', 'ec2:RunInstances', own + 'volume/*', {
        'StringEquals': request_tags, 'Bool': {'ec2:Encrypted': 'true'},
        'NumericLessThanEquals': {'ec2:VolumeSize': '30'},
    })
    allow('LaunchInterfaceInOneSubnet', 'ec2:RunInstances', own + 'network-interface/*', {
        'ArnEquals': {'ec2:Subnet': own + 'subnet/' + subnet},
    })
    allow('UseOnlyReaderSecurityGroups', 'ec2:RunInstances', own + 'security-group/*', {
        'StringEquals': resource_tags,
    })
    allow('CreateGroupInOneVpc', 'ec2:CreateSecurityGroup', own + 'vpc/' + vpc)
    allow('CreateOnlyTaggedGroups', 'ec2:CreateSecurityGroup', own + 'security-group/*', {
        'StringEquals': request_tags,
    })
    allow('ManageOnlyReaderGroupEgress', [
        'ec2:AuthorizeSecurityGroupEgress', 'ec2:RevokeSecurityGroupEgress',
        'ec2:DeleteSecurityGroup',
    ], own + 'security-group/*', {'StringEquals': resource_tags})
    allow('TagOnlyAtCreation', 'ec2:CreateTags', [
        own + kind + '/*' for kind in ['instance', 'volume', 'network-interface', 'security-group']
    ], {'StringEquals': {'ec2:CreateAction': ['RunInstances', 'CreateSecurityGroup'], **request_tags}})
    allow('OperateOnlyReaderInstances', [
        'ec2:StartInstances', 'ec2:StopInstances', 'ec2:RebootInstances',
        'ec2:TerminateInstances',
    ], own + 'instance/*', {'StringEquals': dict(resource_tags, **{'ec2:ResourceTag/Name': STACK})})
    allow('PassOnlyReaderRoleToEc2', 'iam:PassRole', node_role, {
        'StringEquals': {'iam:PassedToService': 'ec2.amazonaws.com'},
    })
    allow('ReadOnlyReaderProfile', 'iam:GetInstanceProfile', profile)
    allow('ReadPublicAmiParameter', ['ssm:GetParameter', 'ssm:GetParameters'],
          f'arn:aws:ssm:{REGION}:*:parameter/aws/service/ami-amazon-linux-latest/*')
    allow('CreateOnlyReaderStackTypes', [
        'cloudformation:CreateStack', 'cloudformation:UpdateStack',
        'cloudformation:CreateChangeSet',
    ], stack, {
        'ForAllValues:StringEquals': {'cloudformation:ResourceTypes': [
            'AWS::EC2::Instance', 'AWS::EC2::SecurityGroup',
        ]},
        'Null': {'cloudformation:ResourceTypes': 'false', 'cloudformation:RoleArn': 'true'},
    })
    allow('InspectAndExecuteOnlyReaderStack', [
        'cloudformation:DescribeStacks', 'cloudformation:DescribeStackEvents',
        'cloudformation:DescribeStackResources', 'cloudformation:ListStackResources',
        'cloudformation:DescribeChangeSet', 'cloudformation:DeleteChangeSet',
        'cloudformation:ExecuteChangeSet', 'cloudformation:GetTemplate',
        'cloudformation:GetTemplateSummary', 'cloudformation:TagResource',
    ], stack)
    allow('SessionsOnlyOnReader', 'ssm:StartSession', own + 'instance/*', {
        'StringEquals': {'ssm:resourceTag/Project': PROJECT,
                         'ssm:resourceTag/Environment': 'p0',
                         'ssm:resourceTag/Name': STACK},
    })
    allow('OnlyStandardSessionDocuments', 'ssm:StartSession', [
        f'arn:aws:ssm:{REGION}:{owner}:document/{doc}'
        for owner in ['', account]
        for doc in ['SSM-SessionManagerRunShell', 'AWS-StartPortForwardingSession',
                    'AWS-StartInteractiveCommand']
    ])
    allow('OnlyReaderNamedSessions', ['ssm:ResumeSession', 'ssm:TerminateSession'],
          f'arn:aws:ssm:{REGION}:{account}:session/dechive-wiki-p0-*')
    deploy = {'Version': '2012-10-17', 'Statement': statements}
    node = {'Version': '2012-10-17', 'Statement': [{
        'Effect': 'Allow', 'Action': [
            'ssm:UpdateInstanceInformation', 'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel', 'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
        ], 'Resource': '*', 'Condition': {'StringEquals': {'aws:RequestedRegion': REGION}},
    }]}
    assume = {'Version': '2012-10-17', 'Statement': [{
        'Effect': 'Allow', 'Action': 'sts:AssumeRole',
        'Resource': iam + 'role/' + DEPLOYER,
        'Condition': {'Bool': {'aws:MultiFactorAuthPresent': 'true'}},
    }]}
    bootstrap = {
        'AWSTemplateFormatVersion': '2010-09-09',
        'Description': 'Reviewed wiki-only access bootstrap. No compute or credentials.',
        'Resources': {
            'ReaderNodeRole': {'Type': 'AWS::IAM::Role', 'Properties': {
                'RoleName': NODE,
                'AssumeRolePolicyDocument': {'Version': '2012-10-17', 'Statement': [{
                    'Effect': 'Allow', 'Principal': {'Service': 'ec2.amazonaws.com'},
                    'Action': 'sts:AssumeRole',
                }]},
                'Policies': [{'PolicyName': 'MinimalSessionAgent', 'PolicyDocument': node}],
            }},
            'ReaderNodeProfile': {'Type': 'AWS::IAM::InstanceProfile', 'Properties': {
                'InstanceProfileName': NODE, 'Roles': [{'Ref': 'ReaderNodeRole'}],
            }},
            'ReaderDeployerRole': {'Type': 'AWS::IAM::Role', 'Properties': {
                'RoleName': DEPLOYER, 'MaxSessionDuration': 3600,
                'AssumeRolePolicyDocument': {'Version': '2012-10-17', 'Statement': [{
                    'Effect': 'Allow', 'Principal': {'AWS': iam + 'user/' + OPERATOR},
                    'Action': 'sts:AssumeRole',
                    'Condition': {'Bool': {'aws:MultiFactorAuthPresent': 'true'},
                                  'StringLike': {'sts:RoleSessionName': 'dechive-wiki-p0-*'}},
                }]},
                'Policies': [{'PolicyName': 'ScopedReaderDeployment', 'PolicyDocument': deploy}],
            }},
            'OperatorAssumePolicy': {'Type': 'AWS::IAM::ManagedPolicy', 'Properties': {
                'ManagedPolicyName': 'DECHIVE-WIKI-P0-ASSUME-DEPLOYER',
                'Users': [OPERATOR], 'PolicyDocument': assume,
            }},
        },
    }
    host = json.loads(Path(__file__).with_name('pilot.json').read_text())
    del host['Resources']['PilotRole']
    del host['Resources']['PilotProfile']
    host['Parameters']['VpcId']['AllowedValues'] = [vpc]
    host['Parameters']['SubnetId']['AllowedValues'] = [subnet]
    host['Parameters']['ImageId'] = {'Type': 'String', 'Default': ami, 'AllowedValues': [ami]}
    host['Parameters']['NodeInstanceProfile'] = {
        'Type': 'String', 'Default': NODE, 'AllowedValues': [NODE],
    }
    instance = host['Resources']['PilotInstance']['Properties']
    instance['IamInstanceProfile'] = {'Ref': 'NodeInstanceProfile'}
    instance['PropagateTagsToVolumeOnCreation'] = True
    return {'deployer-policy.json': deploy, 'node-policy.json': node,
            'operator-assume-policy.json': assume, 'access-bootstrap.json': bootstrap,
            'host-template.json': host}

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['account', 'vpc', 'subnet', 'ami', 'out']:
        p.add_argument('--' + name, required=True)
    a = p.parse_args()
    destination = Path(a.out)
    destination.mkdir(parents=True, exist_ok=False)
    for name, document in documents(a.account, a.vpc, a.subnet, a.ami).items():
        (destination / name).write_text(json.dumps(document, indent=2) + '\n')
    print('ACCESS_PLAN_PREPARED: five review files; no AWS mutation')
