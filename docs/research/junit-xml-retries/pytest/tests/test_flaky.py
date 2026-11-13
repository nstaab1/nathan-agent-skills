def test_passes():
    assert 1 + 1 == 2


def test_fails_once(first_attempt):
    assert not first_attempt, "fails on its first attempt only"
