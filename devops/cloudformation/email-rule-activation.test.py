import importlib.util
import json
import pathlib
import sys
import types
import unittest
from unittest.mock import Mock, patch

sys.modules.setdefault('boto3', types.SimpleNamespace(client=Mock()))
spec = importlib.util.spec_from_file_location('activation', pathlib.Path(__file__).with_name('email-rule-activation.py'))
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)

class ActivationTests(unittest.TestCase):
    def run_event(self, active, request='Create'):
        client = Mock()
        client.describe_active_receipt_rule_set.return_value = {'Metadata': {'Name': active}} if active else {}
        event = {'RequestType': request, 'ResourceProperties': {'RuleSetName': 'owned-rules'},
                 'ResponseURL': 'https://example.invalid/response', 'StackId': 'stack',
                 'RequestId': 'request', 'LogicalResourceId': 'Activation'}
        with patch.object(activation.boto3, 'client', return_value=client), patch.object(activation.urllib.request, 'urlopen') as response:
            activation.handler(event, None)
            body = json.loads(response.call_args.args[0].data)
        return client, body

    def test_creates_only_when_no_other_rule_set_is_active(self):
        client, response = self.run_event(None)
        client.set_active_receipt_rule_set.assert_called_once_with(RuleSetName='owned-rules')
        self.assertEqual(response['Status'], 'SUCCESS')

    def test_never_overwrites_other_active_receiving(self):
        client, response = self.run_event('other-application')
        client.set_active_receipt_rule_set.assert_not_called()
        self.assertEqual(response['Status'], 'FAILED')

    def test_deletion_does_not_deactivate_someone_elses_rules(self):
        client, response = self.run_event('other-application', 'Delete')
        client.set_active_receipt_rule_set.assert_not_called()
        self.assertEqual(response['Status'], 'SUCCESS')

    def test_owned_rule_activation_is_removed_on_delete(self):
        client, _ = self.run_event('owned-rules', 'Delete')
        client.set_active_receipt_rule_set.assert_called_once_with()

if __name__ == '__main__':
    unittest.main()
