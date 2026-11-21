import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  columnName(propertyName: string, customName: string, embeddedPrefixes: string[]): string {
    return this.toSnakeCase([...embeddedPrefixes, customName || propertyName].join('_'));
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return this.toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  private toSnakeCase(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }
}
