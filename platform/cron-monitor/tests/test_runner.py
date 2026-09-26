import re

from sage_cron_monitor.runner import new_session_id

SESSION_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def test_new_session_id_matches_web_rule():
    for _ in range(20):
        assert SESSION_ID.match(new_session_id())


def test_new_session_id_is_unique():
    ids = {new_session_id() for _ in range(50)}
    assert len(ids) == 50
