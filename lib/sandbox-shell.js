var cp = require('child_process');
var path = require('path');
var async = require('async');
var driver = require('./driver');

// Configuration.
var sandboxName = 'tree-jail';  // Name of docker image.
var userName = 'myself';  // Name of user in jail.
var shell = '/bin/bash';  // Shell program to use.
var sandboxTimeout = 60 * 1000;  // Kill sandbox after 60s.

// This function checks that the sandbox exists.
// It returns true in a callback if the sandbox exists.
function validSandbox(cb) {
  var check = cp.spawn('docker', ['images', '-q', sandboxName]);
  var hasSandbox = false;
  check.stdout.on('data', function(data) { hasSandbox = true; });
  check.on('close', function() { cb(hasSandbox); });
}

var home = '/home/' + userName;
var sandboxContainerCount = 0;
// In case we run into a harsher hard limit,
// we don't care about the stderr output.
var ulimit = 'ulimit -S -t ' + (sandboxTimeout / 1000)
    + ' -f ' + (1048576 * 32)  // 32 GB files
    + ' -d ' + (1048576 * 32)  // 32 GB data segment
    + ' -s ' + (1024 * 8)      // 8 MB stack size
    + ' -c ' + 0               // No core file
    + ' -m ' + (1048576 * 32)  // 32 GB resident set size
    + ' -u ' + 1024            // 1024 forked processes
    + ' -n ' + 1024            // 1024 file descriptors
    + ' -l ' + 64              // 64 KB locked-in-memory size
    + ' -v ' + (1048576 * 32)  // 32 GB virtual memory
    + ' -i ' + 62756           // pending signals
    + ' -q ' + (1024 * 800)    // 800 KB message queues
    + ' -e 0 -r 0 2>/dev/null';

// This function starts a sandbox.
// It launches a shell in it (see variable `shell`).
// When the shell is ready, `cb` is called.
function Sandbox(cb) {
  var self = this;
  self.name = 'jail' + sandboxContainerCount;
  sandboxContainerCount++;
  var start = cp.spawn('docker',
    ['run', '-id', '--name', self.name,
     '--user', userName, '--workdir', home,
     sandboxName, shell]);

  // Wait for the container to be created.
  start.on('close', function(code, signal) {
    if (code === 0) {
      cb();
    } else {
      cb(new Error('Creating the sandbox failed.'));
    }
  });
}

Sandbox.prototype = {
  startTimer: function(timeout) {
    // Ready to kill it.
    var self = this;
    if (self.killTimeout !== undefined) {
      var killSandbox = function() {
        self.rm(function(){});
      };
      self.killTimeout = setTimeout(killSandbox, timeout);
    }
  },

  // Run the command in the sandbox.
  // The sandbox is deleted once the command has run.
  // options:
  // - stdout, stderr: function(data: Buffer).
  // - stdin: a Buffer.
  // cb: takes the return code.
  run: function(command, options, cb) {
    var self = this;

    var exec = cp.spawn('docker', ['exec', '-i', '--user=' + userName,
        self.name, shell, '-c', ulimit + '; ' + command]);

    // Set up I/O.
    var stdoutput = new Buffer(0);
    exec.stdout.on('data', function(data) {
      stdoutput = Buffer.concat([stdoutput, data]);
    });
    var stderrput = new Buffer(0);
    exec.stderr.on('data', function(data) {
      stderrput = Buffer.concat([stderrput, data]);
    });
    exec.on('close', function(code, signal) {
      clearTimeout(self.killTimeout);
      if (options.stdout) { options.stdout(stdoutput); }
      if (options.stderr) { options.stderr(stderrput); }
      cb(code);
    });

    self.startTimer(sandboxTimeout);

    if (options.stdin !== undefined) {
      exec.stdin.write(options.stdin);
    }
  },

  // Delete the sandbox container.
  // cb: takes null, or an error.
  rm: function(cb) {
    var self = this;

    // Remove the sandbox container.
    var removeSandbox = function() {
      var remove = cp.spawn('docker', ['rm', self.name]);
      remove.on('close', function(code, signal) {
        if (code === 0) {
          cb();
        } else {
          cb(new Error('Deleting the sandbox failed.'));
        }
      });
    };

    // Ensure all sandbox processes are dead.
    // The killing fails if the container is not running,
    // which we ignore.
    var kill = cp.spawn('docker', ['kill', self.name]);
    kill.on('close', removeSandbox);
  },
};

// Copy a directory to the sandbox.
// The directory is a String rooted in the virtual tree.
// Returns in a callback, as null or an error.
// sandbox: object of type Sandbox.
function copyToSandbox(directory, sandbox, cb) {
  var sandboxProcName = sandbox.name;

  // FIXME: chmod the files such that files not authorized for edition
  // cannot be modified.
  var chmodFiles = function chmodFiles(cb) {
    // The userName's group has the same name.
    var chmod = cp.spawn('docker',
        ['exec', '--user=root', sandboxProcName,
         'chown', userName + ':' + userName, '-R', home]);
    chmod.on('close', function(code, signal) {
      if (code === 0) {
        cb(null);
      } else {
        cb(new Error('Setting files\' ownership to ' + userName + ' failed.'));
      }
    });
  };

  var copy = cp.spawn('docker',
      ['cp', path.join(driver.absolute(directory)) + '/.'
           , sandboxProcName + ':' + home]);
  copy.on('close', function(code, signal) {
    if (code === 0) {
      chmodFiles(cb);
    } else {
      cb(new Error('Copying to the sandbox failed.'));
    }
  });
}

// Copy a list of files (as Strings) from the sandbox to the tree.
// The directory is a String rooted in the virtual tree.
// Returns in a callback, as null or an error.
// sandbox: object of type Sandbox.
function copyFromSandbox(directory, files, sandbox, cb) {
  async.each(files, function(filename, cb) {
    var copy = cp.spawn('docker',
      ['cp', sandbox.name + ':' + path.join(home, filename),
             path.join(driver.absolute(directory),
               path.dirname(filename))]);
    copy.on('close', function(code, signal) {
      if (code === 0) {
        cb(null);  // Everything went well.
      } else {
        cb(new Error('Copying from the sandbox failed.'));
      }
    });
  }, cb);
  // FIXME: chmod the files.
}

// Removes a list of `files` in the sandbox.
// sandbox: object of type Sandbox.
function rmFiles(files, sandbox, cb) {
  var locations = files.map(function(file) {
    return path.join(home, file);
  });
  try {
    async.each(locations, function(location, cb) {
      var deletion = cp.spawn('docker', ['exec', sandbox.name,
          'rm', '-r', location]);
      deletion.stderr.on('data', function(d) { console.error('err:'+d); });
      deletion.on('close', function deleted(code, signal) {
        if (code === 0) { cb(null);
        } else { cb(new Error('Deleting sandbox files for setup failed.')); }
      });
    }, cb);
  } catch(e) { cb(e); return; }
}

// Prevent having more than one at a time.
var sandboxInUse = false;

// Ensure that calls are sequential.
// The directory is a String rooted in the virtual tree.
// The command is a string of shell code (see variable `shell`).
// options:
// - stdout, stderr: function(data: Buffer).
// - stdin: a Buffer.
// - rmFiles: list of files to remove, rooted at the directory picked.
// - fileOutput: list of files to keep, and put back in the main file tree.
// cb: takes the return value, either null or an error.
function runOnDirectory(directory, command, options, cb) {
  if (sandboxInUse) { cb(new Error('Sandbox currently in use')); return; }
  sandboxInUse = true;
  // Options
  options.rmFiles = options.rmFiles || [];

  // How to clean up the sandbox.
  var end = function(enderr) {
    // Whatever the outcome, we assume the sandbox wasn't corrupted.
    // That avoids having to build it again every time,
    // and it is a reasonable assumption.
    sandbox.rm(function(err) {
      // The error should not occur but isn't critical. Log it.
      if (err != null) { console.error(err); }
      sandboxInUse = false;
      cb(enderr);
    });
  };

  // How to copy file outputs.
  var saveFileOutput = function(enderr) {
    if (enderr != null) { return end(enderr); }
    if (options.fileOutput && options.fileOutput.length > 0) {
      copyFromSandbox(directory, options.fileOutput, sandbox, end);
    } else { end(); }
  };

  // How to use the sandbox.
  var filesRemoved = function(err) {
    if (err != null) { end(err); return; }
    sandbox.run(command, options, function(code) {
      if (code === 0) { saveFileOutput(null);
      } else { end(new Error('Error while running command in the sandbox,'
          + ' process code: ' + code));
      }
    });
  };

  // How to copy files into the sandbox.
  var sandboxCreated = function() {
    copyToSandbox(directory, sandbox, function(err) {
      if (err != null) { end(err); return; }
      // If the copy of data happened without issue:
      rmFiles(options.rmFiles, sandbox, filesRemoved);
    });
  };

  // How to start up the sandbox.
  var sandbox = new Sandbox(sandboxCreated);
}

exports.validSandbox = validSandbox;
exports.runOnDirectory = runOnDirectory;
