import common from './common';
import nav from './nav';
import login from './login';
import overview from './overview';
import commands from './commands';
import plugins from './plugins';
import events from './events';
import config from './config';
import logs from './logs';
import terminal from './terminal';
import components from './components';
import serverEvents from './serverEvents';
import link from './link';
import extensions from './extensions';
import marketplace from './marketplace';
import restart from './restart';

/** Every message namespace; keys are used as `namespace.key`. */
export const messages = {
  common, nav, login, overview, commands, plugins, events, config, logs, terminal, components, serverEvents, link, extensions, marketplace, restart,
};
