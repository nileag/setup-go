# setup-go with differentiated cache

This action is a composite of [actions/setup-go](https://github.com/actions/setup-go) and 
[actions/cache](https://github.com/actions/cache) that allows for adding text to a key.
This allows for maintaining a differentiated cache for different jobs. This is important as different
jobs will download different packages from mod and build different packages from each other. Since the cache is immutable
there is no way for it to contain all the various artifacts from all the various jobs, but rather it will only be aligned 
to one job with the rest likely similar since they share the same go.sum and therefore hash but different enough that 
they would benefit from having their own cache instead of having to bridge the gap on every run.
