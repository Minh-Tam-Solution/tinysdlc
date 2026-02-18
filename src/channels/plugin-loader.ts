/**
 * Channel Plugin Loader — CTO-2026-002 ACTION 3 (P1)
 *
 * Registry pattern for discovering and managing channel plugins.
 * Reads `settings.json` channels.enabled to determine which plugins to load.
 *
 * Spec source: OpenClaw plugin loader + Orchestrator `provider_registry.py`
 */

import { ChannelPlugin } from '../lib/channel-plugin';

const registry = new Map<string, ChannelPlugin>();

/**
 * Register a channel plugin in the global registry.
 */
export function register(plugin: ChannelPlugin): void {
    if (registry.has(plugin.id)) {
        throw new Error(`Channel plugin '${plugin.id}' is already registered`);
    }
    registry.set(plugin.id, plugin);
}

/**
 * Get a registered channel plugin by ID.
 */
export function get(id: string): ChannelPlugin | undefined {
    return registry.get(id);
}

/**
 * Get all registered channel plugins.
 */
export function getAll(): ChannelPlugin[] {
    return Array.from(registry.values());
}

/**
 * Get all registered plugin IDs.
 */
export function getRegisteredIds(): string[] {
    return Array.from(registry.keys());
}

/**
 * Check if a plugin is registered.
 */
export function has(id: string): boolean {
    return registry.has(id);
}

/**
 * Unregister a channel plugin.
 */
export function unregister(id: string): boolean {
    return registry.delete(id);
}

/**
 * Connect all registered plugins that match the enabled list.
 * If enabledChannels is not provided, connects all registered plugins.
 */
export async function connectEnabled(enabledChannels?: string[]): Promise<void> {
    const plugins = enabledChannels
        ? getAll().filter(p => enabledChannels.includes(p.id))
        : getAll();

    await Promise.all(plugins.map(p => p.connect()));
}

/**
 * Disconnect all registered plugins.
 */
export async function disconnectAll(): Promise<void> {
    await Promise.all(getAll().map(p => p.disconnect()));
}
