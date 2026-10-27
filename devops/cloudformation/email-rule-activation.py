import json
import urllib.request
import boto3

def handler(event, context):
    props = event['ResourceProperties']
    name = props['RuleSetName']
    client = boto3.client('ses')
    status, reason = 'SUCCESS', 'GuardScale email receiving activation checked'
    try:
        active = client.describe_active_receipt_rule_set().get('Metadata', {}).get('Name')
        if event['RequestType'] == 'Delete':
            if active == name:
                client.set_active_receipt_rule_set()
        else:
            if active and active != name:
                raise ValueError('A different SES receipt rule set is active; refusing to replace it. Use ExistingRuleSetName instead.')
            client.set_active_receipt_rule_set(RuleSetName=name)
    except Exception as error:
        status, reason = 'FAILED', str(error)[:500]
    body = json.dumps({'Status': status, 'Reason': reason,
        'PhysicalResourceId': event.get('PhysicalResourceId', 'guardscale-email-activation-'+name),
        'StackId': event['StackId'], 'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'], 'Data': {}}).encode()
    request = urllib.request.Request(event['ResponseURL'], data=body, method='PUT',
        headers={'content-type': '', 'content-length': str(len(body))})
    with urllib.request.urlopen(request, timeout=20):
        pass
