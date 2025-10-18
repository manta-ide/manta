import json
import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime
import os
import glob

# Find the latest eval results JSON file
eval_files = glob.glob('eval/eval-results-*.json')
if not eval_files:
    raise FileNotFoundError("No eval-results JSON files found in eval/")

# Sort by timestamp in filename (assuming format: eval-results-{scenario}-{runIndex}-{timestamp}.json)
eval_files.sort(key=lambda x: x.split('-')[-1].replace('.json', ''), reverse=True)
json_file_path = eval_files[0]

# Extract timestamp from filename for output naming
timestamp_part = json_file_path.split('-')[-1].replace('.json', '')
with open(json_file_path, 'r') as f:
    data = json.load(f)

runs = data['runs']

# Extract data for plotting
run_numbers = [run['runNumber'] for run in runs]
scores = [run['score'] for run in runs]
timestamps = [datetime.fromisoformat(run['timestamp'].replace('Z', '+00:00')) for run in runs]

# Extract metrics
nodes_created = [run['details']['nodesCreated'] for run in runs]
edges_created = [run['details']['edgesCreated'] for run in runs]
property_coverage = [run['details']['propertyCoverage'] for run in runs]
relationship_accuracy = [run['details']['relationshipAccuracy'] for run in runs]
properties_per_node = [run['details']['averagePropertiesPerNode'] for run in runs]

# Create subplots
fig, axes = plt.subplots(3, 3, figsize=(18, 12))
fig.suptitle('Code to Graph Indexing Evaluation Results', fontsize=16)

# Calculate rolling averages
window_size = 3
rolling_scores = np.convolve(scores, np.ones(window_size)/window_size, mode='valid')
rolling_nodes = np.convolve(nodes_created, np.ones(window_size)/window_size, mode='valid')
rolling_edges = np.convolve(edges_created, np.ones(window_size)/window_size, mode='valid')
rolling_run_numbers = run_numbers[window_size-1:]

# 1. Score over time
axes[0, 0].plot(run_numbers, scores, 'b-o', linewidth=2, markersize=6)
axes[0, 0].set_title('Score Over Runs')
axes[0, 0].set_xlabel('Run Number')
axes[0, 0].set_ylabel('Score')
axes[0, 0].grid(True, alpha=0.3)
axes[0, 0].axhline(y=data['summary']['averageScore'], color='r', linestyle='--', label=f'Avg: {data["summary"]["averageScore"]:.1f}')
axes[0, 0].legend()

# 2. Nodes and Edges created
ax1 = axes[0, 1]
ax1.plot(run_numbers, nodes_created, 'g-s', label='Nodes Created', linewidth=2, markersize=6)
ax1.set_ylabel('Count', color='g')
ax1.tick_params(axis='y', labelcolor='g')
ax1.grid(True, alpha=0.3)

ax2 = ax1.twinx()
ax2.plot(run_numbers, edges_created, color='orange', marker='^', linestyle='-', label='Edges Created', linewidth=2, markersize=6)
ax2.set_ylabel('Count', color='orange')
ax2.tick_params(axis='y', labelcolor='orange')

lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left')
ax1.set_title('Nodes and Edges Created')
ax1.set_xlabel('Run Number')

# 3. Coverage metrics
axes[0, 2].plot(run_numbers, property_coverage, color='purple', marker='d', linestyle='-', label='Property Coverage', linewidth=2, markersize=6)
axes[0, 2].plot(run_numbers, relationship_accuracy, color='red', marker='x', linestyle='-', label='Relationship Accuracy', linewidth=2, markersize=6)
axes[0, 2].set_title('Coverage Metrics')
axes[0, 2].set_xlabel('Run Number')
axes[0, 2].set_ylabel('Coverage/Accuracy')
axes[0, 2].legend()
axes[0, 2].grid(True, alpha=0.3)
axes[0, 2].set_ylim(0, 1.1)

# 4. Properties per node
axes[1, 0].plot(run_numbers, properties_per_node, color='brown', marker='*', linestyle='-', linewidth=2, markersize=8)
axes[1, 0].set_title('Properties Per Node')
axes[1, 0].set_xlabel('Run Number')
axes[1, 0].set_ylabel('Average Properties')
axes[1, 0].grid(True, alpha=0.3)

# 5. Score distribution histogram
axes[1, 1].hist(scores, bins=10, edgecolor='black', alpha=0.7, color='skyblue')
axes[1, 1].set_title('Score Distribution')
axes[1, 1].set_xlabel('Score')
axes[1, 1].set_ylabel('Frequency')
axes[1, 1].axvline(x=data['summary']['averageScore'], color='red', linestyle='--', linewidth=2, label=f'Avg: {data["summary"]["averageScore"]:.1f}')
axes[1, 1].legend()

# 6. Correlation: Property Coverage vs Score
axes[1, 2].scatter(property_coverage, scores, s=50, alpha=0.7, c=relationship_accuracy, cmap='viridis')
axes[1, 2].set_title('Property Coverage vs Score\n(Color: Relationship Accuracy)')
axes[1, 2].set_xlabel('Property Coverage')
axes[1, 2].set_ylabel('Score')
axes[1, 2].grid(True, alpha=0.3)

# Add colorbar for the scatter plot
cbar = plt.colorbar(axes[1, 2].collections[0], ax=axes[1, 2])
cbar.set_label('Relationship Accuracy')

# 7. Score Convergence (Rolling Average)
axes[2, 0].plot(run_numbers, scores, 'b-o', alpha=0.3, linewidth=1, markersize=4, label='Individual Scores')
axes[2, 0].plot(rolling_run_numbers, rolling_scores, 'r-', linewidth=3, label=f'Rolling Avg (window={window_size})')
axes[2, 0].set_title('Score Convergence')
axes[2, 0].set_xlabel('Run Number')
axes[2, 0].set_ylabel('Score')
axes[2, 0].legend()
axes[2, 0].grid(True, alpha=0.3)
axes[2, 0].axhline(y=data['summary']['averageScore'], color='purple', linestyle='--', alpha=0.7, label=f'Overall Avg: {data["summary"]["averageScore"]:.1f}')

# 8. Nodes/Edges Convergence
ax1_conv = axes[2, 1]
ax1_conv.plot(run_numbers, nodes_created, 'g-s', alpha=0.3, linewidth=1, markersize=4, label='Individual Nodes')
ax1_conv.plot(rolling_run_numbers, rolling_nodes, 'darkgreen', linewidth=3, label=f'Rolling Avg Nodes (window={window_size})')
ax1_conv.set_ylabel('Count', color='darkgreen')
ax1_conv.tick_params(axis='y', labelcolor='darkgreen')
ax1_conv.grid(True, alpha=0.3)

ax2_conv = ax1_conv.twinx()
ax2_conv.plot(run_numbers, edges_created, color='orange', marker='^', linestyle='-', alpha=0.3, linewidth=1, markersize=4, label='Individual Edges')
ax2_conv.plot(rolling_run_numbers, rolling_edges, 'darkorange', linewidth=3, label=f'Rolling Avg Edges (window={window_size})')
ax2_conv.set_ylabel('Count', color='darkorange')
ax2_conv.tick_params(axis='y', labelcolor='darkorange')

lines1_conv, labels1_conv = ax1_conv.get_legend_handles_labels()
lines2_conv, labels2_conv = ax2_conv.get_legend_handles_labels()
ax1_conv.legend(lines1_conv + lines2_conv, labels1_conv + labels2_conv, loc='upper left')
ax1_conv.set_title('Nodes/Edges Convergence')
ax1_conv.set_xlabel('Run Number')

# 9. Combined Metrics Trend
axes[2, 2].plot(run_numbers, scores, 'b-', alpha=0.7, label='Score')
axes[2, 2].plot(run_numbers, np.array(property_coverage) * 100, color='purple', linestyle='-', alpha=0.7, label='Property Coverage (%)')
axes[2, 2].plot(run_numbers, np.array(relationship_accuracy) * 100, 'r-', alpha=0.7, label='Relationship Accuracy (%)')
axes[2, 2].set_title('Combined Metrics Trend')
axes[2, 2].set_xlabel('Run Number')
axes[2, 2].set_ylabel('Score / Percentage')
axes[2, 2].legend()
axes[2, 2].grid(True, alpha=0.3)

plt.tight_layout()
output_image_path = os.path.join(os.path.dirname(json_file_path), f'eval_results_plot-{timestamp_part}.png')
plt.savefig(output_image_path, dpi=300, bbox_inches='tight')
print(f"Plot saved to: {output_image_path}")
plt.show()

# Print summary statistics
print(f"Loaded evaluation results from: {json_file_path}")
print("Summary Statistics:")
print(f"Average Score: {data['summary']['averageScore']:.1f}")
print(f"Score Range: {data['summary']['minScore']} - {data['summary']['maxScore']}")
print(f"Average Nodes Created: {data['summary']['averageMetrics']['nodesCreated']:.1f}")
print(f"Average Edges Created: {data['summary']['averageMetrics']['edgesCreated']:.1f}")
print(f"Average Property Coverage: {data['summary']['averageMetrics']['propertyCoverage']:.2f}")
print(f"Average Relationship Accuracy: {data['summary']['averageMetrics']['relationshipAccuracy']:.2f}")
print(f"Standard Deviation: {data['summary']['standardDeviation']:.2f}")
print(f"Consistency Score: {data['summary']['consistencyScore']:.2f}")

print(f"\nMain Problems:")
for problem in data['summary']['mainProblems']:
    print(f"- {problem}")

print(f"\nStrengths:")
for strength in data['summary']['strengths']:
    print(f"- {strength}")
