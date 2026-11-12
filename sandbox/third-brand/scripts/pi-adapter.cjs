// What tools/compare.mjs needs to know about this consumer: its vendored evaluator and row
// shape, its path vocabulary and its rule version. Nothing here touches the engine.
"use strict";
var path = require("path");
var brand = require(path.join(__dirname, "..", "brand.json"));
module.exports = {
  name: brand.brandId,
  evaluator: require(path.join(__dirname, "..", "vendor", "pi-evaluate.js")),
  shape: require(path.join(__dirname, "..", "vendor", "pi-shape.js")),
  paths: require(path.join(__dirname, "..", "paths.json")),
  rules: brand.browser.ruleVersion
};
