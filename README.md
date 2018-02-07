# tree

> A multiplayer file system.
> All files *synced* realtime, offline-ready.
> Use *apps* for each file types.
> Make your own apps on the platform.
> *Access control* per-file.

[thefiletree.com](https://thefiletree.com)

## Install

```bash
git clone https://github.com/garden/tree
cd tree
make start
open http://[::1]:1234
```

## Interface

- Create
  - file: `PUT /` (content is body)
  - folder: `MKCOL /`
- Read
  - `GET /` (show in default browser app)
  - `GET /?app=data` (raw, optional header `Depth:3` for folder; TODO slice)
  - `GET /?app=metadata Content-Type:multipart/form-data` (JSON)
- Update
  - single file:
    - data:
      - overwrite: `PUT /`
      - TODO append: `POST /?op=append`
      - TODO partial: `PATCH /`
      - sync: websocket `/?op=edit&app=text` (TODO json, dir)
    - metadata: `PUT /?app=metadata Content-Type:application/json` (TODO: `PATCH /`)
  - multiple files: `POST /?op=append&content Content-Type:multipart/form-data`
  - folder:
    - TODO copy: `COPY /from Destination:/to Overwrite:T`
    - TODO move: `MOVE /from Destination:/to Overwrite:F`
    - TODO shell: `POST /?op=shell&cmd=make&keep=a.out` (stdin is body, stdout is result, unless websocket)
- Delete: `DELETE /`

## Contribute

- Open [issues](https://github.com/garden/tree/issues)
- Send [pull requests](http://help.github.com/send-pull-requests)
- Contact [Thaddee Tyl](https://twitter.com/espadrine)

## Plans

- JSON sync
- Allow user-made apps
- File search
- Snapshots (may require to migrate the file content to CockroachDB)
- Remote desktop

## Dependencies

This project is covered by the GNU General Public License (version 2) and contains code from:

- [ScoutCamp](https://github.com/espadrine/sc/), a powerful web server (LGPL license)
- [CodeMirror](https://github.com/marijnh/CodeMirror/), a nifty in-browser code editor (MIT license)
- [Canop](https://github.com/espadrine/canop/), a real time sync system (MIT license)
- [CockroachDB](https://www.cockroachlabs.com), a distributed SQL database
