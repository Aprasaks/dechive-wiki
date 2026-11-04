"""Offline fail-closed checks for the static preview CloudFormation plan.

This does not replace CloudFormation cfn-lint, a change set, or AWS account review.
"""
from __future__ import annotations
from pathlib import Path
import yaml

TEMPLATE = Path(__file__).with_name('template.yaml')

class CloudFormationLoader(yaml.SafeLoader):
    pass

for tag in ('!Ref', '!Sub', '!GetAtt', '!Join', '!If', '!Select', '!Split'):
    def construct(loader, node, tag=tag):
        if isinstance(node, yaml.ScalarNode):
            value = loader.construct_scalar(node)
        elif isinstance(node, yaml.SequenceNode):
            value = loader.construct_sequence(node)
        else:
            value = loader.construct_mapping(node)
        return {tag: value}
    CloudFormationLoader.add_constructor(tag, construct)

data = yaml.load(TEMPLATE.read_text(), Loader=CloudFormationLoader)
assert isinstance(data, dict)
resources = data['Resources']
assert set(resources) == {
    'PreviewBucket', 'PreviewOAC', 'PreviewAuthFunction',
    'PreviewResponseHeaders', 'PreviewDistribution', 'PreviewBucketPolicy'
}, 'Unexpected resources: release review required'
assert not any(item['Type'].startswith((
    'AWS::IAM::', 'AWS::EC2::', 'AWS::Route53::', 'AWS::RDS::',
    'AWS::DynamoDB::', 'AWS::Lambda::'
)) for item in resources.values())
assert data['Parameters']['PreviewAuthHeader']['NoEcho'] is True
assert data['Parameters']['PreviewAuthHeader']['MinLength'] >= 20

bucket = resources['PreviewBucket']['Properties']
assert all(value is True for value in bucket['PublicAccessBlockConfiguration'].values())
assert bucket['OwnershipControls']['Rules'][0]['ObjectOwnership'] == 'BucketOwnerEnforced'
assert resources['PreviewBucket']['DeletionPolicy'] == 'Retain'
assert bucket['BucketEncryption']['ServerSideEncryptionConfiguration'][0][
    'ServerSideEncryptionByDefault']['SSEAlgorithm'] == 'AES256'
assert bucket['BucketName']['!Sub'].startswith('dechive-wiki-ui-preview-')

policy = resources['PreviewBucketPolicy']['Properties']['PolicyDocument']['Statement']
assert len(policy) == 1
assert policy[0]['Action'] == 's3:GetObject'
assert policy[0]['Principal'] == {'Service': 'cloudfront.amazonaws.com'}
assert policy[0]['Condition']['StringEquals']['AWS:SourceArn']
assert resources['PreviewOAC']['Properties']['OriginAccessControlConfig']['SigningBehavior'] == 'always'

function = resources['PreviewAuthFunction']['Properties']
assert function['AutoPublish'] is True
assert function['FunctionConfig']['Runtime'] == 'cloudfront-js-2.0'
js = function['FunctionCode']['!Sub']
assert 'authorization' in js and "'Basic ${PreviewAuthHeader}'" in js
assert 'statusCode: 401' in js and 'return event.request;' in js

cd = resources['PreviewDistribution']['Properties']['DistributionConfig']
assert cd['DefaultRootObject'] == 'index.html'
assert cd['ViewerCertificate']['CloudFrontDefaultCertificate'] is True
assert cd['PriceClass'] == 'PriceClass_100'
assert cd['DefaultCacheBehavior']['ViewerProtocolPolicy'] == 'redirect-to-https'
assert cd['DefaultCacheBehavior']['CachePolicyId'] == '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
assert cd['DefaultCacheBehavior']['AllowedMethods'] == ['GET', 'HEAD']
assert cd['DefaultCacheBehavior']['FunctionAssociations'][0]['EventType'] == 'viewer-request'
assert cd['Origins'][0]['S3OriginConfig']['OriginAccessIdentity'] == ''

security = resources['PreviewResponseHeaders']['Properties']['ResponseHeadersPolicyConfig']
assert security['CustomHeadersConfig']['Items'][0]['Header'] == 'X-Robots-Tag'
assert 'noindex' in security['CustomHeadersConfig']['Items'][0]['Value']
csp = security['SecurityHeadersConfig']['ContentSecurityPolicy']['ContentSecurityPolicy']
assert "connect-src 'none'" in csp and "object-src 'none'" in csp
print('PASS: six allowlisted resources; private S3, OAC, Basic auth, HTTPS, noindex, no database or DNS')
