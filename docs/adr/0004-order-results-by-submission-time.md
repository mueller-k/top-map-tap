# Order competing Results by Submission Time

When multiple Submissions target one Participant and MapTap Date, the Submission with the later source time prevails: server receipt time for direct Submissions and GroupMe message creation time for GroupMe imports. This prevents delayed callbacks from overwriting newer work; at equal times the first GroupMe message wins and a direct Submission takes precedence, while identical later Submissions still advance ordering metadata.
