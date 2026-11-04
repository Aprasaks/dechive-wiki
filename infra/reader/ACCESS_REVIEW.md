# Reader deployment access review

The existing operator can manage only their own MFA. The public-reader package in PR #24 is tested, but no application host or database is deployed. Article selection and writing remain with the owner; this change creates no content.

## Proposed security-sensitive change

`access_plan.py` only writes five review documents. The generated access bootstrap creates:

| Resource | Purpose |
| --- | --- |
| `dechive-wiki-p0-deployer` role | One-hour deployment sessions, trusted only by the existing MFA operator; session name must begin `dechive-wiki-p0-` |
| `dechive-wiki-p0-reader-node` role | Five minimal SSM session-agent actions in Seoul; no parameter/secret reads |
| Instance profile with the node role | Allows only this node identity to be attached to the host |
| `DECHIVE-WIKI-P0-ASSUME-DEPLOYER` managed policy | Allows the existing operator to enter that role and use the six required/basic CloudShell actions in Seoul, only with MFA |

The existing self-MFA policy is unchanged. No administrator managed policy, user access key, new password, GitHub trust or external principal is introduced. Creating these roles and attaching the managed policy is a new persistent grant and requires owner confirmation at execution time. Preparing a CloudFormation change set does not execute these grants.

The deployment role can create/update only the named `dechive-wiki-p0-reader` stack, and only when the caller explicitly supplies `--resource-types AWS::EC2::Instance AWS::EC2::SecurityGroup`. It cannot assign a CloudFormation service role or create IAM resources. EC2 launch permissions pin the account/region, AMI, subnet, instance profile, t3.small, project/name tags, required IMDSv2 and encrypted volumes up to 30 GiB. Group operations include egress management, with no ingress-authorization action. Read-only EC2 infrastructure metadata is regional; the policy is not an instance-count or spending quota.

Sessions are limited to matching reader instance tags, standard interactive/port-forwarding documents and the project session-name prefix. There is no RunCommand permission or regional command-output read. IAM simulation is not proof that the full SSM agent/session flow or every CloudFormation operation works; verify those live after approval and do not widen permissions automatically on failure.

## Host boundary

The generated `host-template.json` reuses the reviewed private pilot but removes all IAM resources. It pins network and image parameters and propagates tags to EBS. The template creates only a security group and one instance. There are no open inbound ports. Standard CPU credits, encrypted 30 GiB disk and the existing 24-hour stop timer remain. This is an isolated first connection test; it is not continuous production service. Stopped disks continue incurring charges.

The source and generated host remain reviewable separately from the access bootstrap. No change to the current static domain/distribution is required to validate the private host. Never run the G1 disposable CMS schema-push application in the public-reader artifact.

## Validation

`verify_access.py` performs read-only IAM Access Analyzer validation and 30 actual IAM custom-policy simulations, including intended allows and denial of wrong type/profile/subnet/project, unsafe disks, IAM-user creation, secret reads, other stack/role access, missing MFA, and out-of-region CloudShell. It does not grant policies, provision resources or send article data.

For review, run the generator with the observed account, VPC, subnet and pinned public Amazon Linux AMI into a new directory. Do not commit account-specific generated documents or console credentials. Validate the generated CloudFormation templates and inspect the change set. Record results in the PR. Re-generate if the selected network/image changes.

## Execution after owner confirmation

1. Execute only the final reviewed access change set; wait for completion and inspect the four grants/resources. The root session is used only for this access bootstrap.
2. Owner signs in as `dechive-wiki-operator` with their existing MFA, in Seoul. Credential and MFA entry remains with the owner.
3. Launch a fresh operator CloudShell environment. Use STS to enter the named deployment role with a matching session prefix, keeping short-lived credentials only in that environment. Verify STS identity. Never print, commit or upload credentials.
4. As the assumed role, create a host change set from the generated IAM-free template with the two explicit resource types. Inspect before execution. If authorization fails, stop and review the denied action instead of adding administrator access.
5. Install the pinned, checksum-verified standalone reader package and an isolated PostgreSQL instance; initialize the reviewed schema with an offline schema-owner identity. Expose only the restricted reader credentials to the web process. Begin with an empty catalog; do not choose or publish an article.
6. Test actual role/session access, empty-catalog search, private DB isolation and backup/restore before any real article or public application cutover. Keep the 24-hour stop timer until the owner approves a continuously running configuration.

Official references: [CloudFormation authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html), [minimal SSM node permissions](https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-create-iam-instance-profile.html), [CloudShell permissions](https://docs.aws.amazon.com/cloudshell/latest/userguide/sec-auth-with-identities.html).
