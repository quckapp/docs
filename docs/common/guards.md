---
sidebar_position: 3
---

# Guards

Authentication and authorization guards.

## RolesGuard

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) throw new ForbiddenException('User not authenticated');
    if (user.isBanned) throw new ForbiddenException('User account is banned');

    return requiredRoles.some((role) => user.role === role);
  }
}
```

## PermissionsGuard

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions) return true;

    const { user } = context.switchToHttp().getRequest();

    // Super admin bypass
    if (user.role === 'super_admin') return true;

    const userPermissions = user.permissions || [];
    return requiredPermissions.every((p) => userPermissions.includes(p));
  }
}
```

## Usage

```typescript
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  @Get('users')
  @Roles('admin', 'super_admin')
  getUsers() {}

  @Delete('users/:id')
  @Permissions('users:delete')
  deleteUser() {}
}
```
