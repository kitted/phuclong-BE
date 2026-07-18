import { ID } from '../../../core/interfaces/id.interface';

export interface JwtPayload {
  id: ID;
  role: string;
  _doc?: any;
}
