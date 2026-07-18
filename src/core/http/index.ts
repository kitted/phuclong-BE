/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ApiProperty } from '@nestjs/swagger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ResponseType<T>(ctor: any, isArray = false) {
  const className = ctor.name + '_Data';
  const klass = eval(`(class ${className} {})`);
  ApiProperty({ type: () => ctor, isArray })(klass.prototype, 'data');
  return klass;
}
