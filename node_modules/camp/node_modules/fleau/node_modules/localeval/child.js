var vm = require('vm');

process.on('message', function(m) {
  process.send({
    result: vm.runInNewContext(m.code, m.sandbox)
  });
  process.exit(0);
});
