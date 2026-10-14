# Nimbus

A project management app where teams plan and track work in projects, boards and sprints. This glossary also covers the words the team uses for its own development work, because some of them collide with product terms.

## Product

**Project**:
A place where a team plans and tracks its work. It holds the team's Issues, boards and sprints.
_Avoid_: Workspace, space, board

**Project key**:
A short code that identifies a project and prefixes its Issue numbers, as in `NIM-12`. It never changes and is never reused.
_Avoid_: Prefix, slug, code

**Archived project**:
A project closed to all changes and hidden by default, which can be restored.
_Avoid_: Deleted, closed or inactive project

**Issue**:
A unit of work a team tracks inside a Nimbus project. Only ever means the product concept.
_Avoid_: Ticket, task, GitHub issue

**User**:
A person who can sign in to Nimbus, identified by their email address. One person is one User, however many ways they sign in.
_Avoid_: Account, login

**Member**:
A User who has been added to a project. Only ever means project membership.
_Avoid_: User (when you mean project membership)

**Permission**:
One action a User may be allowed to do, such as editing an Issue.
_Avoid_: Right, privilege, capability

**Role**:
A named set of Grants that can be given to Users, such as Project admin or Viewer.
_Avoid_: Group, permission group, permission set

**Grant**:
A Permission inside a Role, together with its Scope.
_Avoid_: Rule, policy

**Scope**:
How far a Grant reaches: only the User's own records, everything in the project, or everything in Nimbus.
_Avoid_: Range, level, visibility

**Role assignment**:
A User holding a Role, either across all of Nimbus or in one project.
_Avoid_: Group membership, role member

**Linked identity**:
A Google or GitHub login attached to a User, letting them sign in without a password.
_Avoid_: Social account, external account, provider user

## Development workflow

**Feature spec**:
A written plan for one feature (problem, user stories, decisions), kept as a GitHub issue and closed once the feature ships.
_Avoid_: Spec, PRD, issue

**Ticket**:
One small, independently shippable slice of a feature spec, kept as a GitHub sub-issue of that feature spec.
_Avoid_: Issue, task, story

**Module spec**:
A living document in the repo describing how one backend module works now: its public interface, events and tables.
_Avoid_: Spec, design doc
