import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { join } from 'path';

interface InsightStackProps extends StackProps {
  dbHost: string;
  dbClusterResourceId: string;
  dbUser: string;
  dbName: string;
}

export class InsightStack extends Stack {
  constructor(scope: Construct, id: string, props: InsightStackProps) {
    super(scope, id, props);

    const api = new HttpApi(this, 'Api', { apiName: 'insight' });

    const dbConnect = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['rds-db:connect'],
      resources: [
        `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${props.dbClusterResourceId}/${props.dbUser}`,
      ],
    });

    const route = (name: string, file: string, method: HttpMethod, path: string) => {
      const fn = new NodejsFunction(this, name, {
        entry: join(__dirname, '../src/handlers', file),
        runtime: Runtime.NODEJS_22_X,
        memorySize: 256,
        timeout: Duration.seconds(29), // under API Gateway's 30s limit; covers a cold database resume
        logGroup: new LogGroup(this, `${name}Logs`, {
          retention: RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        environment: {
          DB_HOST: props.dbHost,
          DB_USER: props.dbUser,
          DB_NAME: props.dbName,
          DB_REGION: this.region,
        },
      });
      fn.addToRolePolicy(dbConnect);
      api.addRoutes({
        path,
        methods: [method],
        integration: new HttpLambdaIntegration(`${name}Integration`, fn),
      });
    };

    route('CreateIncident', 'create-incident.ts', HttpMethod.POST, '/incidents');
    route('ListIncidents', 'list-incidents.ts', HttpMethod.GET, '/incidents');
    route('VoteIncident', 'vote-incident.ts', HttpMethod.POST, '/incidents/{id}/votes');
    route('RegisterDevice', 'register-device.ts', HttpMethod.PUT, '/devices');

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
