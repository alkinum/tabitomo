const { IOSConfig, withPodfile, withPodfileProperties, withXcodeProject } = require('expo/config-plugins');

const DEFAULT_TEAM_ID = 'PB8H83VL3Z';
const DEFAULT_DEPLOYMENT_TARGET = '16.4';

module.exports = function withXcodeManagedSigning(config, options = {}) {
  const deploymentTarget = options.deploymentTarget || DEFAULT_DEPLOYMENT_TARGET;
  let result = withPodfileProperties(config, (modConfig) => {
    modConfig.modResults['ios.deploymentTarget'] = deploymentTarget;
    return modConfig;
  });

  result = withPodfile(result, (modConfig) => {
    if (!modConfig.modResults.contents.includes('tabitomo-ios-floor')) {
      const ending = /\n {2}end\nend\s*$/;
      if (!ending.test(modConfig.modResults.contents)) throw new Error('Review the Podfile post_install hook before applying the iOS minimum.');
      modConfig.modResults.contents = modConfig.modResults.contents.replace(ending, `
    # tabitomo-ios-floor: dependency resources must support the app's minimum iOS.
    minimum_ios = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current_ios = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current_ios && current_ios.match?(/^[0-9]/) && Gem::Version.new(current_ios) < Gem::Version.new(minimum_ios)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios
        end
      end
    end
  end
end
`);
    }
    return modConfig;
  });

  result = withXcodeProject(result, (modConfig) => {
    const project = modConfig.modResults;
    const teamId = config.ios?.appleTeamId || DEFAULT_TEAM_ID;
    const signableTargets = IOSConfig.Target.findSignableTargets(project);
    const projectSections = Object.entries(IOSConfig.XcodeUtils.getProjectSection(project))
      .filter(IOSConfig.XcodeUtils.isNotComment);

    for (const [targetId, target] of signableTargets) {
      const buildConfigurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
        project,
        target.buildConfigurationList,
      );

      for (const [, buildConfiguration] of buildConfigurations) {
        buildConfiguration.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        buildConfiguration.buildSettings.DEVELOPMENT_TEAM = teamId;
        buildConfiguration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
        buildConfiguration.buildSettings.MARKETING_VERSION = config.version;
        buildConfiguration.buildSettings.CURRENT_PROJECT_VERSION = config.ios?.buildNumber || '1';
        buildConfiguration.buildSettings.PROVISIONING_PROFILE_SPECIFIER = '""';
      }

      for (const [, projectSection] of projectSections) {
        projectSection.attributes.TargetAttributes[targetId] ||= {};
        projectSection.attributes.TargetAttributes[targetId].DevelopmentTeam = teamId;
        projectSection.attributes.TargetAttributes[targetId].ProvisioningStyle = 'Automatic';
        projectSection.attributes.TargetAttributes[targetId].SystemCapabilities ||= {};
        projectSection.attributes.TargetAttributes[targetId].SystemCapabilities['com.apple.iCloud'] = {
          enabled: 1,
        };
      }
    }

    return modConfig;
  });

  return result;
};
