# infra — AWS CDK (Python)

Owned by **M4**. Four stacks:

| Stack | Contents |
| --- | --- |
| `data` | RDS Postgres (`db.t4g.micro` + pgvector), S3 raw zone, EventBridge Scheduler |
| `agents` | Agent worker Lambda (SQS-triggered), Bedrock IAM, OTel → CloudWatch |
| `api` | API Gateway + Lambda (FastAPI/Mangum), SQS queue |
| `frontend` | Amplify Hosting for `apps/web` |

```bash
uv run cdk bootstrap      # once per account/region
uv run cdk deploy --all
```

**Day 1:** request Bedrock model access (approval can take days); set budget alarms
at $25 / $50 / $75; deploy an empty skeleton. See `docs/runbook.md`.

**Do not add:** OpenSearch Serverless, Aurora provisioned, Redshift, MSK,
SageMaker endpoints, NAT Gateway, always-on ECS/Fargate. See `docs/architecture.md`.

> STUB — structure only, no implementation yet.
