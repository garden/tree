/* diff.js: handles translation of the Google diff to the modification delta.
 * Copyright (c) 2011 Thaddée Tyl. All rights reserved.
 * Copyright (c) 2011 Jan Keromnes. All rights reserved.
 * */

(function () {


/* delta (d = [ [0, "Hi ! "], [-1, "hello, here!"], [1, "hello"] ])
 * returns the delta corresponding to the given diff.
 * Here, [ [0, 12, 5], [1, "hello", 5] ]. */
var delta = function (diff) {

  var r = [], charnum = 0;

  for (var i = 0; i < diff.length; i++) {
    var d = diff[i];
    switch (d[0]) {
      case -1:  /* Deletion. */
        r.push ([0, d[1].length, charnum]);
        break;
      case 0:  /* Same. */
        charnum += d[1].length;
        break;
      case 1:  /* Insertion. */
        r.push ([1, d[1], charnum]);
        charnum += d[1].length;
        break;
    }
  }

  return r;

};


/* applydelta (delta = [[0,12,5], [1,"hello",5]], copy = "Hi ! hello, here!")
 * returns an updated copy where the modifications in the delta are applied.
 * Here, "Hi ! hello". */
var applydelta = function (delta, copy) {

  var r = copy;

  for (var i = 0; i < delta.length; i++) {
    var d = delta[i];
    switch (d[0]) {
      case 0:
        r = r.slice (0, d[2]) + r.slice (d[2] + d[1]);
        break;
      case 1:
        r = r.slice (0, d[2]) + d[1] + r.slice (d[2]);
        break;
    }
  }

  return r;

};


/* solve (delta = [[0,12,5], [1,"hello",5]], newdelta = [[1,"ps",0],[1,".",2]])
 * returns an updated version of delta with solved conflicts.
 * Here, [[0,12,8], [1,"hello",8]].
 * Note: this code is non-trivial. Please tread carefully when browsing through.
 */
var solve = function (delta, newdelta) {

  for (var i = 0; i < newdelta.length; i++) {
    /* Solve each new modification in order. */
    var nd = newdelta[i];
    for (var j = 0; j < delta.length; j++) {
      nd = newdelta[i];
      if (nd === undefined || delta[j] === undefined) {
        break;
      }
      switch (nd[0]) {

        case 0:  /* Deletion. */
          if (delta[j][2] > nd[2]) {
            solveRightOfDel (delta, newdelta, [i, j]);
          } else {
            solveLeftOfDel (delta, newdelta, [i, j]);
          }

          break;

        case 1:  /* Insertion. */
          if (nd[2] <= delta[j][2]) {
            delta[j][2] += nd[1].length;
          } else {
            /* We act on the left of the insertion. */
            if (delta[j][0] === 0) {
              if (delta[j][1] < nd[2] - delta[j][2]) {
                nd[2] -= delta[j][1];
              } else {
                  /* They inserted something on a spot that was deleted. */
                  delta[j][1] += nd[1].length;  /* We delete it all first. */
                  nd[2] = delta[j][2];/* Then we insert at the first position.*/
                  j++;
                  delta.splice (j, 0, nd);
              }
            } else {
              /* They inserted something on a spot that was an insertion. */
              nd[2] += delta[j][1].length;
            }
          }
          break;

      }
    }
  }

  return delta;

};

/* solveRightOfDel (delta, newdelta, ij):
 * newdelta is a deletion; delta is an operation that happens on the right
 * of the beginning of that deletion, without any promise about overlapping. */
var solveRightOfDel = function (delta, newdelta, ij) {
  var i = ij[0], j = ij[1];
  var nd = newdelta[i];
  var fromStartToEndDel = (nd[2] + nd[1]) - delta[j][2];

  if (nd[2] + nd[1] <= delta[j][2]) {
    delta[j][2] -= nd[1];
  } else {
    
    if (delta[j][0] === 1) {
      /* We inserted something on a spot that was deleted. */
      nd[1] += delta[j][1].length;  /* Delete it all first. */
      delta[j][2] = nd[2];  /* Then insert at first position. */
      ij[0]++; i++;
      newdelta.splice (i, 0, delta[j]);

    } else {
      /* We deleted something on a spot that was deleted. */
      var toend = delta[j][2] + delta[j][1] - (nd[2] + nd[1]);
      if (toend <= 0) {
        /* All that we deleted was already deleted. */
        nd[1] -= delta[j][1];
        delta.splice (j, 1);
        //ij[1]--;
      } else {
        nd[1] -= fromStartToEndDel;
        delta[j][2] = nd[2];
        delta[j][1] = toend;
      }
    }
  }
};


/* solveLeftOfDel (delta, newdelta, ij):
 * newdelta is a deletion, and delta is an operation that begins
 * before newdelta's beginning point, without certainty about overlapping. */
var solveLeftOfDel = function (delta, newdelta, ij) {
  var i = ij[0], j = ij[1];
  var nd = newdelta[i];
  var fromStartToEndDel = (nd[2] + nd[1]) - delta[j][2];

  switch (delta[j][0]) {

    case 0:  /* We deleted on the left of the deletion. */
      if (delta[j][2] + delta[j][1] <= nd[2]) {
        nd[2] -= delta[j][1];
      } else {
        /* We deleted past the start of their deletion. */

        var toend = nd[2] + nd[1] - (delta[j][2] + delta[j][1])
        if (toend <= 0) {
          /* All that they deleted, we already deleted. */
          delta[j][1] -= nd[1];
          newdelta.splice (i, 1);
          //ij[0]--;

        } else {
          nd[1] -= -fromStartToEndDel;
          nd[2] = delta[j][2];
          nd[1] = toend;
        }
      }
      break;

    case 1:  /* We inserted on the left. */
      nd[2] += delta[j][1].length;
      break;
  }
};


/* Export. */

window.Diff = {};
window.Diff.delta = delta;
window.Diff.applydelta = applydelta;
window.Diff.solve = solve;

})();
