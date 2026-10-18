import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AccountRecovery, UserPool } from 'aws-cdk-lib/aws-cognito';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Schedule, ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
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

    const userPool = new UserPool(this, 'Users', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 8, requireLowercase: true, requireDigits: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Public mobile client: no secret. USER_PASSWORD_AUTH lets the app sign in without an SRP library.
    const userPoolClient = userPool.addClient('MobileClient', {
      generateSecret: false,
      authFlows: { userPassword: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    const api = new HttpApi(this, 'Api', {
      apiName: 'insight',
      defaultAuthorizer: new HttpUserPoolAuthorizer('UserPoolAuthorizer', userPool, {
        userPoolClients: [userPoolClient],
      }),
    });

    const dbConnect = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['rds-db:connect'],
      resources: [
        `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${props.dbClusterResourceId}/${props.dbUser}`,
      ],
    });

    // A Lambda that can connect to the database. `entry` is relative to backend/src.
    const dbFunction = (name: string, entry: string) => {
      const fn = new NodejsFunction(this, name, {
        entry: join(__dirname, '../src', entry),
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
      return fn;
    };

    const route = (name: string, file: string, method: HttpMethod, path: string) => {
      const fn = dbFunction(name, `handlers/${file}`);
      api.addRoutes({
        path,
        methods: [method],
        integration: new HttpLambdaIntegration(`${name}Integration`, fn),
      });
    };

    route('CreateIncident', 'create-incident.ts', HttpMethod.POST, '/incidents');
    route('ListIncidents', 'list-incidents.ts', HttpMethod.GET, '/incidents');
    route('SearchIncidents', 'search-incidents.ts', HttpMethod.GET, '/incidents/search');
    route('VoteIncident', 'vote-incident.ts', HttpMethod.POST, '/incidents/{id}/votes');
    route('DeleteIncident', 'delete-incident.ts', HttpMethod.DELETE, '/incidents/{id}');
    route('MyIncidents', 'my-incidents.ts', HttpMethod.GET, '/me/incidents');
    route('RegisterDevice', 'register-device.ts', HttpMethod.PUT, '/devices');

    // Imports Toronto Police calls for service. Every 10 minutes rather than 5 so the
    // database can still pause between runs (it pauses after 5 idle minutes); the feed
    // keeps about 4 hours of calls, so nothing is missed.
    new Schedule(this, 'ImportPoliceCallsSchedule', {
      schedule: ScheduleExpression.rate(Duration.minutes(10)),
      target: new LambdaInvoke(dbFunction('ImportPoliceCalls', 'jobs/import-police-calls.ts'), {
        retryAttempts: 0, // the next run picks up anything a failed run missed
      }),
    });

    // Imports Toronto Fire active incidents on the same 10-minute cycle. Needs the
    // intersections table (migration 006 + scripts/load-intersections.ts) to place them.
    new Schedule(this, 'ImportFireCallsSchedule', {
      schedule: ScheduleExpression.rate(Duration.minutes(10)),
      target: new LambdaInvoke(dbFunction('ImportFireCalls', 'jobs/import-fire-calls.ts'), {
        retryAttempts: 0,
      }),
    });

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}
