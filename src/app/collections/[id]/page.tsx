import { notFound } from "next/navigation";
import { after } from "next/server";

import { CollectionViewer } from "@/components/CollectionViewer";
import { browseCollection, collectionFacets } from "@/lib/browse";
import { parseQuery } from "@/lib/cardQuery";
import { isSortKey } from "@/lib/cardQuerySql";
import { factsProgress, getOwner } from "@/lib/db";
import { enrichIfNeeded } from "@/lib/enrich";
import { fullQuery, readControls } from "@/lib/filterControls";

// The filter is in the URL and the collection changes on upload, so there is
// nothing here worth caching.
export const dynamic = "force-dynamic";
// Identifying a collection happens behind the response but spends this budget.
export const maxDuration = 300;

/** Next hands search params as a record; the filter helpers read a URL. */
function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }
  return params;
}

export default async function CollectionPage(props: PageProps<"/collections/[id]">) {
  const { id } = await props.params;
  const owner = await getOwner(id);
  if (!owner) notFound();

  const params = toSearchParams(await props.searchParams);
  const controls = readControls(params);
  const text = params.get("q") ?? "";
  const sortParam = params.get("sort") ?? "name";
  const sort = isSortKey(sortParam) ? sortParam : "name";
  const view = params.get("view") === "list" ? "list" : "grid";

  // The controls write the same query language the box takes, so there is one
  // string to parse however the filter was built.
  const { node, warnings } = parseQuery(fullQuery(text, controls));

  const [page, facets, progress] = await Promise.all([
    browseCollection(id, { filter: node, sort }),
    collectionFacets(id),
    factsProgress(id),
  ]);

  // A collection uploaded before any of this existed has no facts at all.
  // Rather than make someone wait to see their own cards, the page renders
  // what is known and the rest is worked out behind the response.
  after(async () => {
    try {
      await enrichIfNeeded(id);
    } catch {
      // Identification is a convenience; the collection lists without it.
    }
  });

  return (
    <CollectionViewer
      owner={owner}
      page={page}
      facets={facets}
      warnings={warnings}
      identifying={{
        total: progress.total,
        identified: progress.identified,
        remaining: progress.total - progress.identified,
      }}
      text={text}
      controls={controls}
      sort={sort}
      view={view}
    />
  );
}
