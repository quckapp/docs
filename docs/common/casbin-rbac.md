---
sidebar_position: 4
---

# Casbin RBAC

Role-based access control using Casbin with MongoDB adapter.

## Model

```ini
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && keyMatch2(r.obj, p.obj) && r.act == p.act || r.sub == "super_admin"
```

## CasbinService

```typescript
@Injectable()
export class CasbinService implements OnModuleInit {
  private enforcer: Enforcer;

  async enforce(sub: string, dom: string, obj: string, act: string): Promise<boolean> {
    return this.enforcer.enforce(sub, dom, obj, act);
  }

  async addRoleForUserInDomain(user: string, role: string, domain: string): Promise<boolean> {
    const added = await this.enforcer.addGroupingPolicy(user, role, domain);
    if (added) await this.enforcer.savePolicy();
    return added;
  }

  async banUser(userId: string, domain: string = '*'): Promise<void> {
    await this.addPolicy({
      subject: userId,
      domain,
      object: '*',
      action: '*',
      effect: 'deny',
    });
  }
}
```

## Default Policies

```typescript
// User policies
{ subject: 'user', domain: '*', object: 'messages', action: 'read', effect: 'allow' }
{ subject: 'user', domain: '*', object: 'messages', action: 'create', effect: 'allow' }

// Moderator policies
{ subject: 'moderator', domain: '*', object: 'messages/*', action: 'delete', effect: 'allow' }

// Admin policies
{ subject: 'admin', domain: '*', object: 'users/*', action: 'ban', effect: 'allow' }
```
