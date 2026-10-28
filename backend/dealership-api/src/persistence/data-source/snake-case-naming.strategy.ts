import {DefaultNamingStrategy} from 'typeorm';

/** `partNumber` in code is `part_number` in the database. */
export class SnakeCaseNamingStrategy extends DefaultNamingStrategy {
  public override columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    const name = customName ?? propertyName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    return embeddedPrefixes.length > 0 ? `${embeddedPrefixes.join('_')}_${name}` : name;
  }
}
