// /api endpoint and authentication.

var pg = require('pg');
var configuration = require('./conf.js');
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
  camp.handle(authenticate);
};

function error(code, msg, err, res) {
  console.error(err);
  res.statusCode = code || 500;
  res.end(msg || 'Internal server error\n');
}

function signup(req, res) {
  var email = req.data.email;
  var name = req.data.name;
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
