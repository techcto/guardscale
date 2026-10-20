import importlib.util
import pathlib
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('routing', pathlib.Path(__file__).with_name('whatsapp-destination.py'))
routing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routing)


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.get_linked_whatsapp_business_account.return_value = {'account': {
            'id': 'waba-test', 'registrationStatus': 'COMPLETE', 'eventDestinations': []}}
        self.client.get_linked_whatsapp_business_account_phone_number.return_value = {
            'linkedWhatsAppBusinessAccountId': 'waba-test'}
        self.event = {'RequestType': 'Create', 'ResourceProperties': {
            'WabaId': 'waba-test', 'SenderId': 'phone-number-id-test', 'TopicArn': 'stack-owned-topic'}}

    def destinations(self, *arns):
        self.client.get_linked_whatsapp_business_account.return_value['account']['eventDestinations'] = [
            {'eventDestinationArn': arn} for arn in arns]

    def test_create_attaches_owned_topic(self):
        routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_called_once_with(
            id='waba-test', eventDestinations=[{'eventDestinationArn': 'stack-owned-topic'}])

    def test_retry_is_idempotent(self):
        self.destinations('stack-owned-topic')
        routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_not_called()

    def test_preserve_other_destination(self):
        self.destinations('another-application-topic')
        with self.assertRaisesRegex(ValueError, 'already routes elsewhere'):
            routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_not_called()

    def test_reject_wrong_sender(self):
        self.client.get_linked_whatsapp_business_account_phone_number.return_value = {
            'linkedWhatsAppBusinessAccountId': 'another-waba'}
        with self.assertRaisesRegex(ValueError, 'does not belong'):
            routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_not_called()

    def test_registration_required(self):
        self.client.get_linked_whatsapp_business_account.return_value['account']['registrationStatus'] = 'INCOMPLETE'
        with self.assertRaisesRegex(ValueError, 'registration'):
            routing.reconcile(self.event, self.client)

    def test_delete_only_detaches_owned_topic(self):
        self.event['RequestType'] = 'Delete'
        self.destinations('another-topic')
        routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_not_called()
        self.destinations('stack-owned-topic')
        routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_called_once_with(
            id='waba-test', eventDestinations=[])

    def test_update_cannot_move_waba_or_topic(self):
        self.event.update(RequestType='Update', OldResourceProperties={
            **self.event['ResourceProperties'], 'WabaId': 'old-waba'})
        with self.assertRaisesRegex(ValueError, 'migration'):
            routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_not_called()

    def test_reverse_rollback_preserves_original_route(self):
        self.destinations('stack-owned-topic')
        self.event.update(RequestType='Update', OldResourceProperties={
            **self.event['ResourceProperties'], 'WabaId': 'failed-new-waba'})
        routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_not_called()

    def test_delete_already_removed_waba(self):
        error = RuntimeError('not found')
        error.response = {'Error': {'Code': 'ResourceNotFoundException'}}
        self.client.get_linked_whatsapp_business_account.side_effect = error
        self.event['RequestType'] = 'Delete'
        routing.reconcile(self.event, self.client)
        self.client.put_whatsapp_business_account_event_destinations.assert_not_called()


if __name__ == '__main__':
    unittest.main()
