Use the repo agents and skills.
Be thourough with your research and precise on iplementation

Act as a Principal Software Architect performing a production-grade architecture review and refactor plan for this repository.



Requirements:

* Preserve all existing behavior.
* No feature changes.
* No business logic changes.
* No API contract changes.
* No signal logic changes.
* No licensing logic changes.



Tasks:

1. Analyze entire repository.
2. Identify architectural debt.
3. Identify coupling, duplication, hidden dependencies, and scalability risks.
4. Propose a Clean Architecture / Hexagonal Architecture structure.
5. Separate Domain, Application, Infrastructure, and Presentation concerns.
6. Provide:

   * Current architecture assessment
   * Technical debt inventory
   * New folder structure
   * Dependency flow diagram
   * Phased migration plan
   * Refactor examples
   * Testing strategy
   * Governance risks



Important:

* Do not immediately rewrite code.
* First perform architectural assessment.
* Justify every recommendation.
* Prefer incremental, low-risk migrations.
* Optimize for long-term maintainability and multi-developer ownership.
* Treat this as a production trading platform where correctness and system stability are more important than elegance.

Identify every place where signal truth, plan truth, regime truth, license truth, and dashboard truth can diverge. Recommend architectural changes that establish a single authoritative source of truth for each domain.

The run is completed when the refactor is complete.
Create and maintain a refactor log md to trace the work done and update it after each run
Create a branch, Push to Remote and Open a new PR - ready for review.