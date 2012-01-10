Those tools assume a `garden` branch, in which you hold an exact copy of what's
on garden/tree.  We use this branch to help you impersonate garden when dealing
with pull requests.

- `pull.sh`  gets modifications from a user (given as a command-line parameter),
  and tests them.

- `accept.sh`  puts those modifications on garden/tree (master branch).

- `garden.sh`  merges garden and your master.

