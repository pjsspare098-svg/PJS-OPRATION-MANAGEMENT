import unittest
from unittest.mock import Mock
from outlook_draft_worker import check_settings, execute_draft


class SafeOutlookWorkerTests(unittest.TestCase):
    def test_config_requires_independent_project(self):
        env={"SUPABASE_URL":"https://wrong.supabase.co","SUPABASE_SERVICE_ROLE_KEY":"x","PJS_OFFICE_OWNER_USER_ID":"bc18aa49-ddff-4c0d-a124-2241416c4809"}
        with self.assertRaises(ValueError):
            check_settings(env)

    def test_draft_requires_approval(self):
        job={"job_type":"email_reply","payload":{"automation_version":"outlook_draft_v1","approved_for_draft":False,"auto_send":False}}
        db=Mock()
        with self.assertRaises(ValueError):
            execute_draft(db,job,prepare=Mock())
        db.table.assert_not_called()

    def test_draft_rejects_auto_send(self):
        job={"job_type":"email_reply","payload":{"automation_version":"outlook_draft_v1","approved_for_draft":True,"auto_send":True}}
        db=Mock()
        with self.assertRaises(ValueError):
            execute_draft(db,job,prepare=Mock())
        db.table.assert_not_called()

    def test_no_draft_when_process_missing(self):
        db=Mock()
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data=[]
        job={"job_type":"email_reply","payload":{"automation_version":"outlook_draft_v1","approved_for_draft":True,"auto_send":False},"process_id":"process-1","process_no":"292168"}
        prepare=Mock()
        with self.assertRaises(ValueError):
            execute_draft(db,job,prepare=prepare)
        prepare.assert_not_called()


if __name__=="__main__":
    unittest.main()
