import {Global, Module} from '@nestjs/common';
import {SETTINGS, settings} from './settings';

/** Makes the settings injectable everywhere: `@Inject(SETTINGS) settings: Settings`. Imported once, by app.module.ts. */
@Global()
@Module({providers: [{provide: SETTINGS, useValue: settings}], exports: [SETTINGS]})
export class SettingsModule {}
