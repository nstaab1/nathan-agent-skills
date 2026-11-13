import pytest


@pytest.mark.parametrize("n", [1, 2])
def test_param(n):
    assert n > 0


@pytest.mark.parametrize("text", ["a b", "x[y]::z"])
def test_param_odd_ids(text):
    assert text


@pytest.mark.parametrize("text", ["same", "same"])
def test_param_same_values(text):
    assert text


class TestGroup:
    def test_in_class(self):
        assert True


def test_fails():
    assert 1 == 2


def test_raises():
    raise TypeError("not an assertion")


@pytest.mark.skip(reason="skipped on purpose")
def test_skipped():
    pass


@pytest.mark.xfail(reason="expected to fail")
def test_xfail():
    assert False


@pytest.fixture
def broken_setup():
    raise RuntimeError("setup blew up")


def test_setup_error(broken_setup):
    pass


@pytest.fixture
def broken_teardown():
    yield
    raise RuntimeError("teardown blew up")


def test_passes_then_teardown_error(broken_teardown):
    pass


def test_fails_then_teardown_error(broken_teardown):
    assert False
