from timApp.tests.server.timroutetest import TimRouteTest
from timApp.timdb.sqa import db


class BrokenDbTest(TimRouteTest):
    def test_broken_db(self):
        db.drop_all()
        db.create_all()
        with self.assertRaises(Exception) as e:
            self.get('/ping')
        self.assertEqual("""
Database has no users; you need to re-initialize it:
./dc stop -t 0 tim celery postgresql
docker volume rm tim-test_data11
delete tim_files folder
./up.sh""".strip(), str(e.exception))
