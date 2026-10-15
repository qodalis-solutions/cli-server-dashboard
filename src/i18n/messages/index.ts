import common from './common';
import nav from './nav';
import login from './login';
import overview from './overview';
import commands from './commands';
import jobs from './jobs';
import plugins from './plugins';
import filesystem from './filesystem';
import events from './events';
import config from './config';
import logs from './logs';
import terminal from './terminal';
import components from './components';

/** Every message namespace; keys are used as `namespace.key`. */
export const messages = {
  common, nav, login, overview, commands, jobs, plugins, filesystem, events, config, logs, terminal, components,
};
