import { App } from 'aws-cdk-lib';
import { InsightStack } from '../lib/insight-stack';

const app = new App();

new InsightStack(app, 'InsightApi', {
  env: { account: '388381628097', region: 'us-east-2' },
  dbHost: 'database-1.cluster-creccy06i6f3.us-east-2.rds.amazonaws.com',
  dbClusterResourceId: 'cluster-NJLXNBJIABC3ZC2QSKAACXBL2A',
  dbUser: 'postgres',
  dbName: 'postgres',
});
