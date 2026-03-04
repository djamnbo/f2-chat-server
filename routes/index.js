var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render(
      'index',
      {
        title: 'F2 Direct Message Backend.',
        dept: 'F-square'
      }
  );
});

module.exports = router;
