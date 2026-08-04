import * as z from 'zod';
import { fa } from 'zod/locales';

/**
 * Switches Zod's built-in messages to Persian, process-wide.
 *
 * This runs as an import side effect of the package barrel so that both the
 * API and the web client get it without either having to remember. Without it,
 * any rule we do not give an explicit `error` message to would surface English
 * text like "Too small: expected string to have >=3 characters" in the UI.
 *
 * Schemas still override individual messages where the stock translation is
 * too literal to show a student — this only guarantees the floor.
 */
z.config(fa());
