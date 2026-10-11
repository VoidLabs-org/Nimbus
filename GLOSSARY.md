# Nimbus

A project management app where teams plan and track work in projects, boards and sprints. This glossary also covers the words the team uses for its own development work, because some of them collide with product terms.

## Product

**Issue**:
A unit of work a team tracks inside a Nimbus project. Only ever means the product concept.
_Avoid_: Ticket, task, GitHub issue

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
