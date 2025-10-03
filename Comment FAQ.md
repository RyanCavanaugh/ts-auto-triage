### What Kind of Feedback Are You Looking For?

We greatly appreciate constructive and actionable feedback on all issues. Constructive and actionable means that we can read your comment and gain new information from it.

Good examples of constructive and actionable feedback:

 * Code examples demonstrating how you would have used or been helped by the feature
 * Examples of third-party libraries that already use patterns like this
 * Describing where existing workarounds fall short of the desired behavior

A good litmus test to see if feedback is useful is to consider the scenario where we have an idea for some feature *other* than exactly the one being proposed, and think it might solve the problem you're having when asking for a particular feature. If you just say "I need this feature", we can't look at your comment and evaluate if the other proposed feature would solve your problem.

Similarly, the same feature request might have many different interpretations. If you just say "I need this", we don't know which *this* you're talking about, and can't figure out which interpretation of the feature is the correct one to implement.

### Time Marches On

Comments noting how long an suggestion has been open, what year it is, etc., are not considered constructive or helpful. We ask that you not bother posting them.

Most programming languages in common use have been in development for decades at this point, and most common feature ideas can be noticed within the first couple years of use, so the only notable thing that we can deduce from a suggestion being longstanding is that the underlying language has withstood the test of time and is still in use *despite* lacking that feature - if anything, evidence against its priority.

Similarly, in successful languages, most ideas that are easy and good get implemented quickly, so if you're looking at a longstanding issue, it's like either much more difficult or much less good than you might be thinking it is. Engaging with the problem, or providing useful context on why you think the change would be helpful, are constructive ways that you can comment on these threads.

Extending long threads with unconstructive comments like this has many downsides:

 * Doesn't do anything to clarify why any particular change is more important than the thousands of other open suggestions (evolving a language is not a first-in first-out queue)
 * Makes it harder to find useful content in the thread itself
 * Adds noise to search results
 * Increases the number of times someone has to click "Show More" once we reach the pagination limit

### Can I Work On This?

If this is in the `Backlog` milestone, yes! See also https://github.com/microsoft/TypeScript/blob/main/CONTRIBUTING.md#issue-claiming. Issues may also be marked with "Help Wanted" but this label is not necessary; the milestone field is authoritative.

If an issue isn't in the `Backlog` milestone, please be advised that PRs may not be reviewed and may not be accepted.

### Any Updates?

There are generally no nonpublic updates that can be retrieved by asking "Any updates?".

Our [iteration plans](https://github.com/microsoft/TypeScript/labels/Planning), [meeting notes](https://github.com/microsoft/TypeScript/labels/Design%20Notes), and other plans are available for perusal.

If you'd like to see a particular bug fixed, feel free to raise it in the active milestone's iteration plan. We do our best to prioritize issues that people are encountering.

If there are features you'd like to see added:

 * If it's in the `Backlog` milestone, PRs are welcomed!
 * If it's not in the `Backlog` milestone, see "What Kind of Feedback Are You Looking For?"

### This Is Closed, But Should Be Open, Or Vice Versa

Every project on GitHub uses slightly different definitions of "Open" and "Closed".

For us, "Open" means "There is known work left to do". An unfixed bug, for example, should be left open. A suggestion we're still working out the details on, or assessing the need for, is also likely to be Open.

"Closed" means "There is not known work left to do". A fixed bug, for example, is always closed; there is nothing left to do. A suggestion which is clearly out-of-scope for the project, either by going against its core design principles, or being simply unrelated to its core goals, would also be closed.

Not every example is clear-cut. As with all things in life, when there are grey areas to be found, and it's [hard to find definitions that everyone agrees with](https://danluu.com/impossible-agree/).

These are the edge case rules that we've decided on for clarity:

 * A *bug* (i.e. known defect) that is so trivial as to not ever be bothersome (for example, a benign crash that only occurs in a file specifically crafted to overflow the parser stack) may be considered a "Won't Fix". In this case, it is *Closed* because there is not "work left to do"
 * A *suggestion* (feature idea) that seems quite unlikely to provide a good return on investment in the foreseeable future would be Closed, because we've done the work (gathered feedback, considered the pros and cons, and made a decision)
   * Sometimes the decision will be "Not right now, but definitely possibly later?" - in this case, Open is the correct state, because the work is "Keep collecting feedback to see how priorities change". A suggestion may be Open for a very long time as a result. We do not Close suggestions *simply* because they were brought up a long time ago, and don't Close issues simply because they haven't been done fast enough for someone's liking.
 * A *design limitation* (acknowledged problem, but one where we have no idea how to fix it, or how to fix it without unacceptable downsides) is Closed. These are difficult cases where we've agreed that the issue is a problem *per se*, but can't see any solution that would be acceptable. There is no "work to be done" here because "Make a breakthrough" is not work that can be concretely pursued.
   * If you think you have a solution to a problem marked "design limitation", feel free to send a PR, we will evaluate it.

All decisions are "only for now". The JS ecosystem is ever-changing, developer priorities are ever-changing, and the project itself will always be evolving over time. This doesn't mean we need to leave *every* issue Open just to leave open a slight chance of a future possibility -- the "Re-open" button is always there, and we're always capable of changing our minds in the face of new evidence or new circumstances. Open/Closed in these gray areas represents *our best guess* at the long-term state of all of these decisions.

It's worth noting that the Open/Close state flows *from* the maintainers' point of view *to* the issue, not vice versa. Reopening a Suggestion for a feature that we actively don't want to be part of the language won't make us start wanting it. Similarly, reopening a Design Limitation that we have no idea how to fix won't make us able to address it.

Open/Closed definition is a project-wide decision and we don't make per-issue deviations from this definition. Complaining about open/closed state isn't constructive, and please remember that insistence in engaging in nonconstructive discussion is against the [code of conduct](https://microsoft.github.io/codeofconduct/).

On a related note, this project does not use the "Closed as Completed" / "Closed as Not Planned" distinction, please do not consult this information. The "close reason" field was added in 2022 so all closed issues prior to that are marked as "Completed" even if nothing was done as a result. Additionally, for a long time thereafter, it wasn't possible to set this field when closing via automation, so auto-closed issues also have an incorrect "close reason". Please don't consult this field, draw any conclusions from it, or ask maintainers to change it -- we don't consult it, and we consider labels / discussion comments to be the correct source of truth as to why an issue was closed (setting aside the philosophical paradox of whether one can be said to have "completed" something involving zero planned work).

