// openapi-typescript (packages/api's type generator) builds its output with TypeScript's JavaScript API, which
// TypeScript 7 no longer has. It declares TypeScript as a peer, which pnpm fills with the repo's TypeScript 7, so here
// it gets its own TypeScript 5 instead while everything else stays on 7.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === "openapi-typescript") {
        delete pkg.peerDependencies?.typescript;
        pkg.dependencies = { ...pkg.dependencies, typescript: "5.9.3" };
      }
      return pkg;
    },
  },
};
