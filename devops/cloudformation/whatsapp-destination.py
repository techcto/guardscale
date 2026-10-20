"""CloudFormation-only WABA routing lifecycle. Never called by the application."""
import json
import urllib.request


def reconcile(event, client):
    props = event['ResourceProperties']
    waba, topic = props['WabaId'], props['TopicArn']
    try:
        account = client.get_linked_whatsapp_business_account(id=waba)['account']
    except Exception as error:
        if event['RequestType'] == 'Delete' and getattr(error, 'response', {}).get('Error', {}).get('Code') == 'ResourceNotFoundException':
            return  # Registration was already removed; no route remains to detach.
        raise
    destinations = account.get('eventDestinations', [])
    if event['RequestType'] == 'Delete':
        # Only detach the exact stack-owned topic; never touch a replacement destination.
        if destinations and all(d['eventDestinationArn'] == topic for d in destinations):
            client.put_whatsapp_business_account_event_destinations(id=waba, eventDestinations=[])
        return
    if event['RequestType'] == 'Update':
        old = event['OldResourceProperties']
        changed = (old['WabaId'], old['TopicArn']) != (waba, topic)
        # A failed migration's reverse rollback is a no-op when the original route remains.
        if changed and not (destinations and all(d['eventDestinationArn'] == topic for d in destinations)):
            raise ValueError('WABA/topic changes require a separate reviewed routing migration.')
    phone = client.get_linked_whatsapp_business_account_phone_number(id=props['SenderId'])
    if phone.get('linkedWhatsAppBusinessAccountId') not in (waba, account.get('id'), account.get('arn')):
        raise ValueError('The launch sender does not belong to this WABA.')
    if account.get('registrationStatus') != 'COMPLETE':
        raise ValueError('Complete WhatsApp business registration before launch.')
    if any(d['eventDestinationArn'] != topic for d in destinations):
        raise ValueError('WABA already routes elsewhere. Preserve its existing topic or explicitly migrate it first.')
    if not destinations:
        client.put_whatsapp_business_account_event_destinations(
            id=waba, eventDestinations=[{'eventDestinationArn': topic}])


def handler(event, context):
    import boto3
    from botocore.config import Config
    status, reason = 'SUCCESS', 'WABA routing reconciled.'
    try:
        reconcile(event, boto3.client('socialmessaging', config=Config(
            connect_timeout=5, read_timeout=10, retries={'max_attempts': 2})))
    except Exception as error:
        status = 'FAILED'
        # Never log the event, presigned response URL, provider body or phone details.
        reason = str(error) if isinstance(error, ValueError) else 'AWS routing operation failed: ' + type(error).__name__
    body = json.dumps({'Status': status, 'Reason': reason,
        'PhysicalResourceId': event.get('PhysicalResourceId') or event['StackId'] + '/' + event['LogicalResourceId'],
        'StackId': event['StackId'], 'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'], 'NoEcho': True, 'Data': {}}).encode()
    request = urllib.request.Request(event['ResponseURL'], data=body, method='PUT',
        headers={'content-type': '', 'content-length': str(len(body))})
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except Exception:
        raise RuntimeError('Unable to deliver CloudFormation response; retry required.') from None
