const { IOSConfig, withPodfileProperties, withXcodeProject } = require('expo/config-plugins');

const DEFAULT_TEAM_ID = 'PB8H83VL3Z';
const DEFAULT_DEPLOYMENT_TARGET = '16.4';

module.exports = function withXcodeManagedSigning(config, options = {}) {
  const deploymentTarget = options.deploymentTarget || DEFAULT_DEPLOYMENT_TARGET;
  let result = withPodfileProperties(config, (modConfig) => {
    modConfig.modResults['ios.deploymentTarget'] = deploymentTarget;
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
