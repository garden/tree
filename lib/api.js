// /api endpoint and authentication.

var log = require('./log');
var pg = require('pg');
var configuration = require('./conf');
var pgConfig = configuration.pg;
pgConfig.pg = pg;
var EmailLogin = require('email-login');
var emailLogin = new EmailLogin({
  db: new EmailLogin.PgDb(pgConfig),
  mailer: configuration.mailer,
});
var website = "http://127.0.0.1:1234";

exports.main = function (camp) {
  camp.get('/api/1/signup', signup);
  camp.get('/api/1/login', login);
  camp.get('/~', home);
  camp.handle(authenticate);
};

function error(code, msg, err, res) {
  if (err) { log.error(err); }
  res.statusCode = code || 500;
  res.json({errors: [msg || 'Internal Server Error']});
}

// The following should be considered a valid name: 0ééλ統𝌆
var allowedUsernames = /^[\w\xa0-\u1fff\u2c00-\u2dff\u2e80-\ud7ff\uf900-\uffef\u{10000}-\u{2fa1f}]{1,20}$/u;
var reservedNames = /^(root|app|about|demo|lib|api|doc|test|\w|\w\w)$/;

function allowedUsername(name) {
  // FIXME: Verify inexistence in database.
  return allowedUsernames.test(name) && !reservedNames.test(name);
}

function signup(req, res) {
  var email = req.data.email;
  var name = req.data.name;
  if (!allowedUsernames(name)) {
    error(400, "Disallowed name", null, res);
    return;
  }
  emailLogin.login(function(err, token, session) {
    if (err != null) { error(500, "Sign up failed", err, res); return; }
    req.cookies.set('token', token);
    emailLogin.proveEmail({
      token: token,
      email: email,
      name: 'TheFileTree account creation: confirm your email address',
      confirmUrl: function(tok) {
        return website + "/api/1/login?name=" + encodeURIComponent(name) +
          "&token=" + tok;
      },
    }, function(err) {
      if (err != null) {
        error(500, "Sending the email confirmation failed", err, res);
        return;
      }
      res.redirect('/app/account/signed-up.html');
    });
  });
}

function login(req, res) {
  var name = req.data.name;
  emailLogin.confirmEmail(req.cookies.get('token'), req.data.token,
  function(err, token, session) {
    if (err != null) { error(500, "Login failed", err, res); return; }
    if (token) {
      emailLogin.setAccountData(session.email, {name: name}, function(err) {
        if (err != null) { error(500, "Login failed", err, res); return; }
        req.cookies.set('token', token);
        res.redirect('/app/account/logged-in.html');
      });
    } else {
      res.redirect('/app/account/email-not-confirmed.html');
    }
  });
}

function home(req, res) {
  if (req.user && (typeof req.user.name === 'string')) {
    res.redirect('/' + req.user.name);
  } else { res.redirect('/'); }
}

function authenticate(req, res, next) {
  emailLogin.authenticate(req.cookies.get('token'),
  function(err, authenticated, session, token) {
    if (token) { req.cookies.set('token', token); }
    if (authenticated && session.emailVerified()) {
      req.user = {
        email: session.email,
        name: session.account.data.name,
      };
    }
    next();
  });
}
exports.authenticate = authenticate;
