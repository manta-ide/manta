import * as React from "react"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type ProjectCardProps = {
  title: string
  description: string
  githubUrl: string
}

export function ProjectCard({ title, description, githubUrl }: ProjectCardProps) {
  return (
    <Card id="node-element-project-card" className="group hover:shadow-lg transition-shadow">
      <CardHeader className="gap-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* reserved for additional content */}
      </CardContent>
      <CardAction>
        <Button asChild variant="destructive" size="sm" className="transition-transform group-hover:translate-y-0.5">
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            View on GitHub
          </a>
        </Button>
      </CardAction>
    </Card>
  )
}

export default ProjectCard
