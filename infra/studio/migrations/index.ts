import * as migration_20261109_141308_initial_private_studio from './20261109_141308_initial_private_studio';

export const migrations = [
  {
    up: migration_20261109_141308_initial_private_studio.up,
    down: migration_20261109_141308_initial_private_studio.down,
    name: '20261109_141308_initial_private_studio'
  },
];
