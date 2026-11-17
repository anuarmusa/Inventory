// Expo config plugin: on Windows, build native (C++) code in short folders outside node_modules.
//
// Why: CMake names object files after their full source path, inside each library's build folder
// (node_modules/<library>/android/.cxx/...). For react-native-reanimated that puts the repository's
// path in twice and goes past Windows' 260-character limit, and ninja fails ("mkdir ... No such file
// or directory" / "build.ninja still dirty"). Building each library in <drive>:\cxx\<library> instead
// keeps paths short without moving the repository, and CMAKE_OBJECT_PATH_MAX makes CMake shorten
// the object file names that are still too long.
//
// It goes in settings.gradle (gradle.beforeProject) because the root build.gradle runs too late:
// Expo's root plugin has already configured the libraries by then.
const { withSettingsGradle } = require('expo/config-plugins');

const MARKER = '// @inventory/short-native-build-dir';

const block = `
${MARKER}
// Windows only: build each module's native code in <repo drive>:\\cxx\\<module> to stay under MAX_PATH.
if (System.getProperty("os.name").toLowerCase().contains("windows")) {
    def cxxRoot = new File(settings.rootDir.toPath().getRoot().toFile(), "cxx")
    gradle.beforeProject { p ->
        ["com.android.library", "com.android.application"].each { id ->
            p.plugins.withId(id) {
                p.android.externalNativeBuild.cmake.buildStagingDirectory = new File(cxxRoot, p.name)
                // CMake names object files after their full source path; past this length it switches
                // to short hashed names. Generated code (e.g. gesture-handler's) needs it.
                p.android.defaultConfig.externalNativeBuild.cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=240"
            }
        }
    }
}
`;

module.exports = function withShortNativeBuildDir(config) {
  return withSettingsGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('with-short-native-build-dir expects a Groovy android/settings.gradle');
    }
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += block;
    }
    return mod;
  });
};
