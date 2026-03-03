import { createBeforeHandler, createAfterHandler } from './interceptor.js';
import { ConfigManager } from './config.js';
import { ChangeQueue } from './state-manager.js';
import { createLogger, enableDebugMode } from './debug.js';
import { join } from 'path';
const logger = createLogger('DiffPlugin');
/**
 * OpenCode Diff Plugin
 *
 * A plugin that provides enhanced diff viewing and interaction capabilities
 * for OpenCode. It intercepts file edit operations and displays rich diffs
 * with syntax highlighting and navigation features.
 */
/**
 * Main plugin factory function
 *
 * @param context - The OpenCode plugin context
 * @returns Plugin instance
 */
export default async function diffPlugin(context) {
    logger.info('Initializing...');
    logger.debug('Plugin context', {
        directory: context.directory,
        hasShell: !!context.$
    });
    if (process.env.DEBUG?.includes('opencode-diff-plugin')) {
        enableDebugMode();
    }
    const configManager = new ConfigManager(context.directory);
    try {
        configManager.validateOrThrow();
        logger.info('Configuration loaded successfully');
        logger.debug('Configuration values', configManager.getConfig());
    }
    catch (error) {
        logger.error('Configuration error', error);
    }
    if (!configManager.isEnabled()) {
        logger.info('Plugin is disabled in configuration');
        return {};
    }
    logger.info('Plugin enabled', {
        maxFileSize: configManager.getMaxFileSize(),
        theme: configManager.getTheme(),
        autoAcceptPatterns: configManager.getConfig().autoAccept.length,
        autoRejectPatterns: configManager.getConfig().autoReject.length,
    });
    // Initialize ChangeQueue with persistence if IDE integration is enabled
    const config = configManager.getConfig();
    const enablePersistence = config.ide?.enabled ?? false;
    const stateFilePath = config.ide?.stateFilePath ?? '.opencode/.diff-plugin-state.json';
    const statePath = join(context.directory, stateFilePath);
    let changeQueue;
    if (enablePersistence) {
        logger.info('IDE integration enabled', { statePath });
        logger.debug('Initializing ChangeQueue with persistence');
        try {
            changeQueue = new ChangeQueue({
                enablePersistence: true,
                statePath,
            });
            // Wait for state to load before proceeding
            await changeQueue.ready;
            const pendingCount = changeQueue.size();
            logger.info('Persistence initialized', { pendingCount });
        }
        catch (error) {
            logger.error('Failed to initialize persistence', error);
            logger.warn('Falling back to in-memory mode');
            changeQueue = new ChangeQueue();
        }
    }
    else {
        logger.info('IDE integration disabled, using in-memory only');
        changeQueue = new ChangeQueue();
    }
    logger.info('Initialized successfully', {
        hookCount: 2,
        persistenceEnabled: enablePersistence,
    });
    return {
        'tool.execute.before': createBeforeHandler(context.$, context.directory, configManager, changeQueue),
        'tool.execute.after': createAfterHandler(context.$, context.directory, configManager, changeQueue),
    };
}
export { ConfigManager, DEFAULT_CONFIG } from './config.js';
// Export interceptor utilities for testing
export { createBeforeHandler, createAfterHandler } from './interceptor.js';
export { changeQueue, InterceptedError } from './state-manager.js';
//# sourceMappingURL=index.js.map