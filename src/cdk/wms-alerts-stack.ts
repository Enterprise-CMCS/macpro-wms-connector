import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface WmsAlertsStackProps extends cdk.StackProps {
  stage: string;
  alertEmails: string[];
}

export class WmsAlertsStack extends cdk.Stack {
  public readonly alertsTopicArn: string;

  constructor(scope: Construct, id: string, props: WmsAlertsStackProps) {
    super(scope, id, props);

    const alertEmails = Array.from(
      new Set(props.alertEmails.map((email) => email.trim()).filter((email) => email.length > 0))
    );
    if (alertEmails.length === 0) {
      throw new Error('At least one alert recipient email is required.');
    }

    const alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: `Alerts-wms-alerts-${props.stage}`,
    });

    alertsTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal('events.amazonaws.com'),
          new iam.ServicePrincipal('cloudwatch.amazonaws.com'),
        ],
        actions: ['sns:Publish'],
        resources: [alertsTopic.topicArn],
      })
    );

    for (const email of alertEmails) {
      alertsTopic.addSubscription(new subscriptions.EmailSubscription(email));
    }

    this.alertsTopicArn = alertsTopic.topicArn;
    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: this.alertsTopicArn,
      description: 'SNS topic ARN for WMS connector alerts.',
    });
  }
}
