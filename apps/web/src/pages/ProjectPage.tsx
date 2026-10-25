import { Alert, Button, Container, Group, Stack, Text, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { Tag } from "@repo/ui/tag";
import { useParams } from "react-router";
import { ApiError } from "../api/client";
import { loadFailure, refreshFailed, useProject } from "../api/queries";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";

/** Read-only project details. Editing and archiving belong to the following tickets. */
export default function ProjectPage() {
  const { key = "" } = useParams();
  const query = useProject(key);
  const project = query.data;
  const failure = loadFailure(query);

  // A project that is unknown and one the User cannot see have exactly the same page.
  if (query.error instanceof ApiError && query.error.status === 404 && !query.isFetching) {
    return (
      <StatusPage
        eyebrow="Error 404"
        title="Project not found."
        body="Check the project link or ask a project Member for help."
        code="404"
        name="Not found"
        actions={<PrimaryAction to="/projects">Go to Projects</PrimaryAction>}
      />
    );
  }
  if (failure) return <FailedLoadPage failure={failure} onRetry={() => void query.refetch()} />;

  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail
          crumbs={[
            { label: "Projects", to: "/projects" },
            project ? { label: project.name } : { label: "", pending: true },
          ]}
        />
        {!project ? (
          <Loading>
            <Stack gap="lg">
              <Bone width="55%" height={44} />
              <Panel p="xl">
                <Stack>
                  <Bone width={80} height={24} />
                  <Bone height={18} />
                  <Bone width="70%" height={18} />
                </Stack>
              </Panel>
            </Stack>
          </Loading>
        ) : (
          <>
            {refreshFailed(query) && (
              <Alert color="yellow" title="Couldn't refresh this project">
                Showing the last loaded details.{" "}
                <Button variant="subtle" size="compact-sm" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              </Alert>
            )}
            <Group gap="sm">
              <Tag>{project.key}</Tag>
              {project.archived && <Tag>Archived</Tag>}
            </Group>
            <Title order={1} fz={40} lh={1.1} style={{ overflowWrap: "anywhere" }}>
              {project.name}
            </Title>
            <Panel p="xl">
              <Stack gap="sm">
                <Title order={2} fz={20}>
                  About this project
                </Title>
                <Text
                  c={project.description ? undefined : "dimmed"}
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {project.description || "No description yet."}
                </Text>
              </Stack>
            </Panel>
          </>
        )}
      </Stack>
    </Container>
  );
}
