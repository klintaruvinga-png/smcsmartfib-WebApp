"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FIXTURE_DIR = path.resolve(__dirname, "..", "fixtures");

function loadFixture(name) {
    const fullPath = path.resolve(FIXTURE_DIR, name.endsWith(".json") ? name : name + ".json");
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function loadAllFixtures() {
    return fs
        .readdirSync(FIXTURE_DIR)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => loadFixture(file));
}

function loadAnchorFixtures() {
    return loadAllFixtures().filter((fixture) => fixture.kind === "anchor");
}

module.exports = {
    FIXTURE_DIR,
    loadFixture,
    loadAllFixtures,
    loadAnchorFixtures,
};
